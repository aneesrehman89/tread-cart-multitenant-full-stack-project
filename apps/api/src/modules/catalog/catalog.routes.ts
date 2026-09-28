import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireTenantContext } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { cached, defaultTtl, tenantKey, writeThrough, invalidatePrefix } from '../../cache/cache.js';
import { resolvePrices } from '../pricing/pricing.service.js';
import { notFound } from '../../lib/errors.js';

export const catalogRouter: Router = Router();

const listQuery = z.object({
  type: z.enum(['TIRE', 'WHEEL', 'ACCESSORY']).optional(),
  brand: z.string().optional(),
  // Tire fitment: 225/45R17
  width: z.coerce.number().int().optional(),
  ratio: z.coerce.number().int().optional(),
  rim: z.coerce.number().int().optional(),
  // Wheel fitment
  bolt: z.string().optional(),
  groupId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});

// Cached per tenant; the key includes filters and customer group.
catalogRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { tenant, db } = requireTenantContext(req);
    const q = listQuery.parse(req.query);

    const key = tenantKey(
      tenant.slug,
      'catalog',
      'products',
      Buffer.from(JSON.stringify(q)).toString('base64url'),
    );

    const payload = await cached(key, defaultTtl, async () => {
      const skuFilter = {
        ...(q.width ? { sectionWidthMm: q.width } : {}),
        ...(q.ratio ? { aspectRatio: q.ratio } : {}),
        ...(q.rim ? { rimDiameterIn: q.rim } : {}),
        ...(q.bolt ? { boltPattern: q.bolt } : {}),
      };
      const hasSkuFilter = Object.keys(skuFilter).length > 0;

      const where = {
        isActive: true,
        ...(q.type ? { type: q.type } : {}),
        ...(q.brand ? { brand: { slug: q.brand } } : {}),
        ...(hasSkuFilter ? { skus: { some: { isActive: true, ...skuFilter } } } : {}),
      };

      const [items, total] = await Promise.all([
        db.product.findMany({
          where,
          include: {
            brand: true,
            images: { orderBy: { position: 'asc' }, take: 1 },
            skus: {
              where: { isActive: true, ...skuFilter },
              include: { inventory: true },
              orderBy: { basePriceCents: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
          skip: (q.page - 1) * q.perPage,
          take: q.perPage,
        }),
        db.product.count({ where }),
      ]);

      return { items, total, page: q.page, perPage: q.perPage };
    });

    // Pricing resolved outside the cache so one list serves every group.
    const groupId = q.groupId ?? null;
    const skuLines = payload.items.flatMap((p) =>
      p.skus.map((s) => ({ skuId: s.id, quantity: 1 })),
    );
    const prices = groupId ? await resolvePrices(db, tenant.slug, skuLines, groupId) : [];
    const priceBySku = new Map(prices.map((p) => [p.skuId, p]));

    res.json({
      ...payload,
      items: payload.items.map((p) => ({
        ...p,
        skus: p.skus.map((s) => ({
          ...s,
          price: priceBySku.get(s.id) ?? {
            skuId: s.id,
            unitPriceCents: s.basePriceCents,
            listPriceCents: s.basePriceCents,
            discountCents: 0,
            currency: s.currency,
            appliedGroupId: null,
            reason: 'base' as const,
          },
        })),
      })),
    });
  }),
);

catalogRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const { tenant, db } = requireTenantContext(req);
    const slug = req.params.slug!;

    const product = await cached(
      tenantKey(tenant.slug, 'catalog', 'product', slug),
      defaultTtl,
      () =>
        db.product.findUnique({
          where: { slug },
          include: {
            brand: true,
            images: { orderBy: { position: 'asc' } },
            skus: {
              where: { isActive: true },
              include: { inventory: true, fitments: { include: { vehicle: true } } },
            },
          },
        }),
    );

    if (!product) throw notFound(`No product with slug "${slug}"`);
    res.json(product);
  }),
);

const stockSchema = z.object({
  onHand: z.number().int().min(0),
  reorderAt: z.number().int().min(0).optional(),
});

// Write-through: Postgres first, then refresh Redis.
catalogRouter.put(
  '/skus/:skuId/stock',
  requireAuth,
  requirePermission('inventory:write'),
  asyncHandler(async (req, res) => {
    const { tenant, db } = requireTenantContext(req);
    const skuId = req.params.skuId!;
    const body = stockSchema.parse(req.body);

    const updated = await writeThrough(
      tenantKey(tenant.slug, 'inventory', skuId),
      defaultTtl,
      () =>
        db.inventoryItem.upsert({
          where: { skuId },
          create: { skuId, onHand: body.onHand, reorderAt: body.reorderAt ?? 0 },
          update: { onHand: body.onHand, ...(body.reorderAt != null ? { reorderAt: body.reorderAt } : {}) },
        }),
    );

    // Product listings embed stock, so their cached copies are now stale.
    await invalidatePrefix(tenantKey(tenant.slug, 'catalog'));

    res.json(updated);
  }),
);
