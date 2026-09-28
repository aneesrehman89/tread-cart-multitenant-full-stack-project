import { Router } from 'express';
import { z } from 'zod';
import { controlDb } from '../../db/control.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { resolveSellerTenant, sellerContext } from '../../middleware/seller-tenant.js';
import { invalidateTenantLookup } from '../../middleware/tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { invalidatePrefix, tenantKey } from '../../cache/cache.js';
import { sellerSignupRouter } from './signup.routes.js';
import { sellerAuthRouter } from './seller.auth.js';
import { googleRouter } from './google.routes.js';
import { sellerDashboardRouter } from './dashboard.routes.js';
import { sellerProductsRouter } from './products.routes.js';
import { sellerOrdersRouter } from './orders.routes.js';
import { sellerCustomersRouter } from './customers.routes.js';
import { sellerStaffRouter } from './staff.routes.js';

// Mounted before tenant middleware; tenant comes from the session (see seller-tenant.ts).
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

/** The theme tokens a store may change. Structure and spacing stay fixed. */
export const FONT_CHOICES = ['inter', 'dm-sans', 'manrope', 'source-serif', 'space-grotesk'] as const;
export const BUTTON_STYLES = ['rounded', 'pill', 'square'] as const;
export const BUTTON_WEIGHTS = ['solid', 'soft', 'outline'] as const;
export const CARD_STYLES = ['soft', 'flat', 'bordered'] as const;

const settingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().nullable().optional(),
  fontFamily: z.enum(FONT_CHOICES).optional(),
  buttonStyle: z.enum(BUTTON_STYLES).optional(),
  buttonWeight: z.enum(BUTTON_WEIGHTS).optional(),
  cardStyle: z.enum(CARD_STYLES).optional(),
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
      fontFamily: record.fontFamily,
      buttonStyle: record.buttonStyle,
      buttonWeight: record.buttonWeight,
      cardStyle: record.cardStyle,
      // Offered to the settings screen so the choices live in one place.
      choices: {
        fonts: FONT_CHOICES,
        buttonStyles: BUTTON_STYLES,
        buttonWeights: BUTTON_WEIGHTS,
        cardStyles: CARD_STYLES,
      },
      domains: record.domains,
      // Read-only: renaming a database is a platform operation.
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

    // Clear the tenant lookup cache so changes show immediately.
    await invalidateTenantLookup(existing.slug, existing.domains.map((d) => d.host));
    // Drop the cached home payload so theme changes show immediately.
    await invalidatePrefix(tenantKey(existing.slug, 'shop'));

    res.json(updated);
  }),
);
