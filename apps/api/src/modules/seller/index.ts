import { Router } from 'express';
import { z } from 'zod';
import { controlDb } from '../../db/control.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { resolveSellerTenant, sellerContext } from '../../middleware/seller-tenant.js';
import { invalidateTenantLookup } from '../../middleware/tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { sellerSignupRouter } from './signup.routes.js';
import { sellerAuthRouter } from './seller.auth.js';
import { googleRouter } from './google.routes.js';
import { sellerDashboardRouter } from './dashboard.routes.js';
import { sellerProductsRouter } from './products.routes.js';
import { sellerOrdersRouter } from './orders.routes.js';
import { sellerCustomersRouter } from './customers.routes.js';
import { sellerStaffRouter } from './staff.routes.js';

/**
 * The seller dashboard API.
 *
 * Mounted before the tenant middleware, because the tenant is taken from the
 * signed-in staff record rather than a request header — see
 * middleware/seller-tenant.ts for why that distinction matters.
 */
export const sellerRouter: Router = Router();

// Public: signing up and signing in both happen without a session.
sellerRouter.use('/signup', sellerSignupRouter);
sellerRouter.use('/auth', googleRouter);
sellerRouter.use('/auth', sellerAuthRouter);

// Everything past this point is a signed-in seller acting on their own store.
sellerRouter.use(requireAuth, resolveSellerTenant);

sellerRouter.use('/dashboard', sellerDashboardRouter);
sellerRouter.use('/products', sellerProductsRouter);
sellerRouter.use('/orders', sellerOrdersRouter);
sellerRouter.use('/customers', sellerCustomersRouter);
sellerRouter.use('/staff', sellerStaffRouter);

const settingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().nullable().optional(),
});

/** Storefront settings: the store's own white-label branding. */
sellerRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const { tenant } = sellerContext(req);
    const record = await controlDb.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      include: { domains: true },
    });

    res.json({
      slug: record.slug,
      name: record.name,
      status: record.status,
      brandPrimary: record.brandPrimary,
      brandAccent: record.brandAccent,
      logoUrl: record.logoUrl,
      domains: record.domains,
      // Shown read-only: a seller should see where their data lives, but
      // renaming a database is a platform operation.
      databaseName: record.databaseName,
      createdAt: record.createdAt,
    });
  }),
);

sellerRouter.patch(
  '/settings',
  requirePermission('tenant:manage'),
  asyncHandler(async (req, res) => {
    const { tenant } = sellerContext(req);
    const body = settingsSchema.parse(req.body);

    const existing = await controlDb.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      include: { domains: true },
    });

    const updated = await controlDb.tenant.update({ where: { id: tenant.id }, data: body });

    // The storefront resolves tenants through a cached lookup, so a rename or
    // a colour change has to clear it to show up straight away.
    await invalidateTenantLookup(existing.slug, existing.domains.map((d) => d.host));

    res.json(updated);
  }),
);
