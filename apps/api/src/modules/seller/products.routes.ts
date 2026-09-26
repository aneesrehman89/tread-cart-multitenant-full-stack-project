import { Router } from 'express';
import { z } from 'zod';
import { sellerContext } from '../../middleware/seller-tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { requirePermission } from '../../middleware/rbac.js';
import { invalidatePrefix, tenantKey } from '../../cache/cache.js';
import { conflict, notFound } from '../../lib/errors.js';

export const sellerProductsRouter: Router = Router();

/** Storefront reads are cached, so every write here has to clear them. */
async function bustCatalog(slug: string): Promise<void> {
  await invalidatePrefix(tenantKey(slug, 'catalog'));
}

const listQuery = z.object({
  q: z.string().optional(),
  type: z.enum(['TIRE', 'WHEEL', 'ACCESSORY']).optional(),
  stock: z.enum(['IN', 'LOW', 'OUT']).optional(),
  status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
});

sellerProductsRouter.get(
  '/',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const q = listQuery.parse(req.query);

    const products = await db.product.findMany({
      where: {
        ...(q.type ? { type: q.type } : {}),
        ...(q.status ? { isActive: q.status === 'ACTIVE' } : {}),
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' as const } },
                { brand: { name: { contains: q.q, mode: 'insensitive' as const } } },
                { skus: { some: { sku: { contains: q.q, mode: 'insensitive' as const } } } },
              ],
            }
          : {}),
      },
      include: {
        brand: true,
        images: { orderBy: { position: 'asc' }, take: 1 },
        skus: { include: { inventory: true }, orderBy: { basePriceCents: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    // Stock state is derived across a product's SKUs, so it is filtered here
    // rather than in SQL.
    const rows = products
      .map((p) => {
        const onHand = p.skus.reduce((a, s) => a + (s.inventory?.onHand ?? 0), 0);
        const reorderAt = p.skus.reduce((a, s) => a + (s.inventory?.reorderAt ?? 0), 0);
        const stockState = onHand === 0 ? 'OUT' : onHand <= reorderAt ? 'LOW' : 'IN';
        return { ...p, onHand, reorderAt, stockState };
      })
      .filter((p) => !q.stock || p.stockState === q.stock);

    res.json({ products: rows, total: rows.length });
  }),
);

sellerProductsRouter.get(
  '/brands',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const brands = await db.brand.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ brands });
  }),
);

const skuSchema = z.object({
  sku: z.string().min(1).max(60),
  basePriceCents: z.number().int().min(0),
  compareAtCents: z.number().int().min(0).nullable().optional(),
  onHand: z.number().int().min(0).default(0),
  reorderAt: z.number().int().min(0).default(0),
  // Tire attributes
  sectionWidthMm: z.number().int().nullable().optional(),
  aspectRatio: z.number().int().nullable().optional(),
  rimDiameterIn: z.number().int().nullable().optional(),
  loadIndex: z.number().int().nullable().optional(),
  speedRating: z.enum(['Q', 'R', 'S', 'T', 'U', 'H', 'V', 'W', 'Y', 'Z']).nullable().optional(),
  season: z
    .enum(['ALL_SEASON', 'SUMMER', 'WINTER', 'ALL_TERRAIN', 'MUD_TERRAIN'])
    .nullable()
    .optional(),
  // Wheel attributes
  wheelWidthIn: z.number().nullable().optional(),
  boltPattern: z.string().nullable().optional(),
  offsetMm: z.number().int().nullable().optional(),
  finish: z.string().nullable().optional(),
});

const productSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: z.enum(['TIRE', 'WHEEL', 'ACCESSORY']),
  brandName: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  skus: z.array(skuSchema).min(1, 'A product needs at least one SKU'),
});

sellerProductsRouter.post(
  '/',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = productSchema.parse(req.body);

    if (await db.product.findUnique({ where: { slug: body.slug } })) {
      throw conflict(`A product with slug "${body.slug}" already exists`);
    }
    const dupeSku = await db.sku.findFirst({ where: { sku: { in: body.skus.map((s) => s.sku) } } });
    if (dupeSku) throw conflict(`SKU "${dupeSku.sku}" already exists`);

    // Brands are created on demand so the seller does not manage them first.
    const brand = await db.brand.upsert({
      where: { slug: slugify(body.brandName) },
      create: { name: body.brandName, slug: slugify(body.brandName) },
      update: {},
    });

    const product = await db.product.create({
      data: {
        name: body.name,
        slug: body.slug,
        type: body.type,
        description: body.description ?? null,
        isActive: body.isActive,
        brandId: brand.id,
        skus: {
          create: body.skus.map(({ onHand, reorderAt, ...sku }) => ({
            ...sku,
            inventory: { create: { onHand, reorderAt } },
          })),
        },
      },
      include: { skus: { include: { inventory: true } }, brand: true },
    });

    await bustCatalog(tenant.slug);
    res.status(201).json(product);
  }),
);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

sellerProductsRouter.patch(
  '/:id',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = patchSchema.parse(req.body);

    const existing = await db.product.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw notFound('Product not found');

    const product = await db.product.update({ where: { id: existing.id }, data: body });
    await bustCatalog(tenant.slug);
    res.json(product);
  }),
);

sellerProductsRouter.delete(
  '/:id',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);

    const existing = await db.product.findUnique({
      where: { id: req.params.id! },
      include: { skus: { include: { orderItems: { take: 1 } } } },
    });
    if (!existing) throw notFound('Product not found');

    // A product that has been ordered is hidden, not deleted: removing it
    // would break the order history that references its SKUs.
    const hasOrders = existing.skus.some((s) => s.orderItems.length > 0);
    if (hasOrders) {
      await db.product.update({ where: { id: existing.id }, data: { isActive: false } });
      await bustCatalog(tenant.slug);
      res.json({ deleted: false, hidden: true, reason: 'Product appears on existing orders' });
      return;
    }

    await db.product.delete({ where: { id: existing.id } });
    await bustCatalog(tenant.slug);
    res.json({ deleted: true });
  }),
);

const stockSchema = z.object({
  onHand: z.number().int().min(0),
  reorderAt: z.number().int().min(0).optional(),
});

sellerProductsRouter.put(
  '/skus/:skuId/stock',
  requirePermission('inventory:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = stockSchema.parse(req.body);

    const sku = await db.sku.findUnique({ where: { id: req.params.skuId! } });
    if (!sku) throw notFound('SKU not found');

    const inventory = await db.inventoryItem.upsert({
      where: { skuId: sku.id },
      create: { skuId: sku.id, onHand: body.onHand, reorderAt: body.reorderAt ?? 0 },
      update: {
        onHand: body.onHand,
        ...(body.reorderAt != null ? { reorderAt: body.reorderAt } : {}),
      },
    });

    await bustCatalog(tenant.slug);
    res.json(inventory);
  }),
);

const priceSchema = z.object({ basePriceCents: z.number().int().min(0) });

sellerProductsRouter.put(
  '/skus/:skuId/price',
  requirePermission('pricing:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = priceSchema.parse(req.body);

    const sku = await db.sku.findUnique({ where: { id: req.params.skuId! } });
    if (!sku) throw notFound('SKU not found');

    const updated = await db.sku.update({ where: { id: sku.id }, data: body });
    await bustCatalog(tenant.slug);
    res.json(updated);
  }),
);

/** Bulk actions from the table's selection bar. */
const bulkSchema = z.object({
  productIds: z.array(z.string()).min(1),
  action: z.enum(['PUBLISH', 'HIDE']),
});

sellerProductsRouter.post(
  '/bulk',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = bulkSchema.parse(req.body);

    const result = await db.product.updateMany({
      where: { id: { in: body.productIds } },
      data: { isActive: body.action === 'PUBLISH' },
    });

    await bustCatalog(tenant.slug);
    res.json({ updated: result.count });
  }),
);

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
