import { Router } from 'express';
import { z } from 'zod';
import { controlDb } from '../../db/control.js';
import { asyncHandler } from '../../middleware/error.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { provisionTenant } from '../../scripts/provision-tenant.js';
import { invalidatePrefix } from '../../cache/cache.js';
import { logger } from '../../lib/logger.js';

/**
 * Seller application review. Approving is the only path that creates a store:
 * it provisions the tenant database and turns the applicant into its owner.
 */
export const applicationsRouter: Router = Router();

const listQuery = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).optional(),
});

applicationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);

    const applications = await controlDb.sellerApplication.findMany({
      // Drafts are half-finished signups; they are not a review queue.
      where: q.status ? { status: q.status } : { status: { not: 'DRAFT' } },
      include: {
        tenant: { select: { slug: true, name: true, status: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const pending = await controlDb.sellerApplication.count({
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    });

    res.json({ applications: applications.map(strip), pendingCount: pending });
  }),
);

applicationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const application = await controlDb.sellerApplication.findUnique({
      where: { id: req.params.id! },
      include: {
        tenant: { select: { slug: true, name: true, status: true } },
        reviewedBy: { select: { name: true } },
      },
    });
    if (!application) throw notFound('Application not found');
    res.json(strip(application));
  }),
);

/** Claiming an application for review, so two admins do not both work it. */
applicationsRouter.post(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const application = await controlDb.sellerApplication.findUnique({
      where: { id: req.params.id! },
    });
    if (!application) throw notFound('Application not found');
    if (application.status !== 'SUBMITTED') {
      throw badRequest(`Only a submitted application can be opened for review`);
    }

    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: { status: 'UNDER_REVIEW', reviewedById: req.actor!.staffUserId },
    });
    res.json(strip(updated));
  }),
);

/**
 * Approve: provision the store database, apply the tenant schema, and create
 * the applicant as its owner using the password they chose at signup.
 */
applicationsRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const application = await controlDb.sellerApplication.findUnique({
      where: { id: req.params.id! },
    });
    if (!application) throw notFound('Application not found');
    if (application.status === 'APPROVED') throw conflict('Already approved');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      throw badRequest(`Cannot approve an application that is ${application.status}`);
    }
    if (!application.storeSlug || !application.storeName) {
      throw badRequest('This application has no store page details');
    }

    // Approval spans three writes that are not in one transaction: the
    // database cannot be created inside one, and the schema push is a separate
    // process. A retry after a partial failure must therefore be able to pick
    // up where it left off, so an existing tenant is only a conflict when some
    // *other* application already owns it.
    const existingTenant = await controlDb.tenant.findUnique({
      where: { slug: application.storeSlug },
    });
    if (existingTenant) {
      const owner = await controlDb.sellerApplication.findFirst({
        where: { tenantId: existingTenant.id, id: { not: application.id } },
      });
      if (owner) throw conflict(`A store already exists at "${application.storeSlug}"`);
    }

    // provisionTenant upserts, so re-running it against a half-created store
    // is safe and simply re-applies the schema.
    const { id: tenantId } = await provisionTenant({
      slug: application.storeSlug,
      name: application.storeName,
      host: `${application.storeSlug}.localhost`,
      brandPrimary: application.brandPrimary,
      brandAccent: application.brandAccent,
    });

    // The applicant becomes the store owner, reusing the password hash from
    // signup so they can sign in immediately with what they already chose.
    const existingOwner = await controlDb.staffUser.findFirst({
      where: { tenantId, email: application.email },
    });
    if (!existingOwner) {
      await controlDb.staffUser.create({
        data: {
          email: application.email,
          name: application.contactName,
          // One of these is always set: a local password, or a Google account.
          passwordHash: application.passwordHash,
          googleId: application.googleId,
          avatarUrl: application.avatarUrl,
          role: 'TENANT_OWNER',
          tenantId,
        },
      });
    }

    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: {
        status: 'APPROVED',
        tenantId,
        reviewedAt: new Date(),
        reviewedById: req.actor!.staffUserId,
        reviewNote: z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {}).note ?? null,
      },
      include: { tenant: { select: { slug: true, name: true, status: true } } },
    });

    await invalidatePrefix('platform:');
    logger.info({ applicationId: application.id, tenantId }, 'seller application approved');

    res.json(strip(updated));
  }),
);

applicationsRouter.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const body = z.object({ note: z.string().min(1).max(500) }).parse(req.body);

    const application = await controlDb.sellerApplication.findUnique({
      where: { id: req.params.id! },
    });
    if (!application) throw notFound('Application not found');
    if (application.status === 'APPROVED') {
      throw badRequest('This application has already been approved');
    }

    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: {
        status: 'REJECTED',
        reviewNote: body.note,
        reviewedAt: new Date(),
        reviewedById: req.actor!.staffUserId,
      },
    });

    res.json(strip(updated));
  }),
);

/** Never expose the password hash or live verification codes. */
function strip<T extends Record<string, unknown>>(application: T) {
  const { passwordHash, emailCode, phoneCode, ...rest } = application as Record<string, unknown>;
  void passwordHash;
  void emailCode;
  void phoneCode;
  return rest;
}
