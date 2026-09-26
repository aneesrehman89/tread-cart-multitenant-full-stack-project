import { Router } from 'express';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { hash as hashPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { asyncHandler } from '../../middleware/error.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { isProduction } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * Public seller signup. No authentication: the seller has no account yet and
 * no tenant exists to scope them to. The application sits in the control
 * plane until the platform team approves it, and approval is what provisions
 * the store database (see platform/applications.routes.ts).
 */
export const sellerSignupRouter: Router = Router();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** Six digits, zero-padded, so "004821" is as likely as "904821". */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * In development the codes are returned in the response so the wizard can be
 * completed without a mail or SMS provider. In production they must only ever
 * be delivered out of band.
 */
function exposeCodes(emailCode: string, phoneCode: string) {
  return isProduction ? {} : { devEmailCode: emailCode, devPhoneCode: phoneCode };
}

const startSchema = z
  .object({
    contactName: z.string().min(1).max(120),
    email: z.string().email(),
    phone: z.string().min(6).max(32),
    password: z.string().min(10, 'Use at least 10 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Step 1: create the account and send both verification codes. */
sellerSignupRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const body = startSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const existing = await controlDb.sellerApplication.findUnique({ where: { email } });
    if (existing && existing.status !== 'DRAFT') {
      throw conflict('An application already exists for that email');
    }
    if (await controlDb.staffUser.findFirst({ where: { email } })) {
      throw conflict('That email already has an account');
    }

    const emailCode = generateCode();
    const phoneCode = generateCode();
    const passwordHash = await hashPassword(body.password);

    const data = {
      email,
      passwordHash,
      contactName: body.contactName,
      phone: body.phone,
      emailCode,
      phoneCode,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
    };

    // Restarting a draft replaces it rather than erroring, so an abandoned
    // signup does not permanently block the address.
    const application = existing
      ? await controlDb.sellerApplication.update({ where: { id: existing.id }, data })
      : await controlDb.sellerApplication.create({ data });

    logger.info({ applicationId: application.id, email }, 'seller application started');

    res.status(201).json({
      applicationId: application.id,
      email,
      phone: application.phone,
      ...exposeCodes(emailCode, phoneCode),
    });
  }),
);

async function loadDraft(id: string) {
  const application = await controlDb.sellerApplication.findUnique({ where: { id } });
  if (!application) throw notFound('Application not found');
  if (application.status !== 'DRAFT') {
    throw badRequest('This application has already been submitted and can no longer be edited');
  }
  return application;
}

const verifySchema = z.object({ code: z.string().min(4).max(8) });

sellerSignupRouter.post(
  '/:id/verify-email',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);
    const { code } = verifySchema.parse(req.body);

    if (application.emailCode !== code) throw unprocessable('That email code is not correct');

    await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: { emailVerifiedAt: new Date(), emailCode: null },
    });
    res.json({ emailVerified: true });
  }),
);

sellerSignupRouter.post(
  '/:id/verify-phone',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);
    const { code } = verifySchema.parse(req.body);

    if (application.phoneCode !== code) throw unprocessable('That phone code is not correct');

    await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: { phoneVerifiedAt: new Date(), phoneCode: null },
    });
    res.json({ phoneVerified: true });
  }),
);

sellerSignupRouter.post(
  '/:id/resend',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);
    const channel = z.object({ channel: z.enum(['email', 'phone']) }).parse(req.body).channel;

    const code = generateCode();
    await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: channel === 'email' ? { emailCode: code } : { phoneCode: code },
    });

    res.json({ sent: channel, ...(isProduction ? {} : { devCode: code }) });
  }),
);

const storeSchema = z.object({
  storeName: z.string().min(1).max(120),
  storeSlug: z.string().regex(SLUG_RE, 'Lowercase letters, digits and hyphens only'),
  category: z.string().min(1),
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** Step 2: store page and branding. */
sellerSignupRouter.patch(
  '/:id/store',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);
    const body = storeSchema.parse(req.body);
    const slug = body.storeSlug.toLowerCase();

    // The slug becomes the tenant slug and its database name, so it has to be
    // free against live stores and other pending applications alike.
    if (await controlDb.tenant.findUnique({ where: { slug } })) {
      throw conflict(`The store address "${slug}" is already taken`);
    }
    const clash = await controlDb.sellerApplication.findFirst({
      where: { storeSlug: slug, id: { not: application.id }, status: { not: 'REJECTED' } },
    });
    if (clash) throw conflict(`The store address "${slug}" is already requested`);

    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: { ...body, storeSlug: slug },
    });
    res.json(publicView(updated));
  }),
);

const businessSchema = z.object({
  legalName: z.string().min(1).max(200),
  taxId: z.string().min(1).max(60),
  addressLine1: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(2),
});

/** Step 3: registered business details. */
sellerSignupRouter.patch(
  '/:id/business',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);
    const body = businessSchema.parse(req.body);
    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: body,
    });
    res.json(publicView(updated));
  }),
);

const kycSchema = z.object({
  kycDocType: z.enum(['CNIC', 'PASSPORT', 'DRIVING_LICENCE', 'BUSINESS_REG']),
  // S3 object keys from a signed upload, not the files themselves.
  kycFrontKey: z.string().min(1),
  kycBackKey: z.string().min(1).optional(),
});

/** Step 4: identity documents. */
sellerSignupRouter.patch(
  '/:id/kyc',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);
    const body = kycSchema.parse(req.body);
    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: body,
    });
    res.json(publicView(updated));
  }),
);

/** Step 5: submit for review. Everything required must be present by now. */
sellerSignupRouter.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const application = await loadDraft(req.params.id!);

    const missing: string[] = [];
    if (!application.emailVerifiedAt) missing.push('email verification');
    if (!application.phoneVerifiedAt) missing.push('phone verification');
    if (!application.storeName || !application.storeSlug) missing.push('store page');
    if (!application.legalName || !application.taxId) missing.push('business details');
    if (!application.kycFrontKey) missing.push('KYC document');

    if (missing.length > 0) {
      throw unprocessable(`Cannot submit yet — still missing: ${missing.join(', ')}`);
    }

    const updated = await controlDb.sellerApplication.update({
      where: { id: application.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    logger.info({ applicationId: updated.id }, 'seller application submitted');
    res.json(publicView(updated));
  }),
);

/** Status page. Public by id, so the seller can check back without an account. */
sellerSignupRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const application = await controlDb.sellerApplication.findUnique({
      where: { id: req.params.id! },
      include: { tenant: { select: { slug: true, name: true, status: true } } },
    });
    if (!application) throw notFound('Application not found');
    res.json(publicView(application));
  }),
);

/** Never leak the password hash or the live verification codes. */
function publicView<T extends Record<string, unknown>>(application: T) {
  const { passwordHash, emailCode, phoneCode, ...rest } = application as Record<string, unknown>;
  void passwordHash;
  void emailCode;
  void phoneCode;
  return rest;
}
