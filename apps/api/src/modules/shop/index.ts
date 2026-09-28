import { Router } from 'express';
import { z } from 'zod';
import { requireTenantContext } from '../../middleware/tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { notFound } from '../../lib/errors.js';
import { cached, defaultTtl, tenantKey } from '../../cache/cache.js';
import { optionalCustomer, requireCustomer, shopAuthRouter } from './shop.auth.js';
import { checkoutRouter } from './checkout.routes.js';

// Tenant comes from X-Tenant-Slug or hostname; the caller is the store's own frontend.
export const shopRouter: Router = Router();

// Resolve the shopper session up front since it affects pricing.
shopRouter.use(optionalCustomer);

shopRouter.use('/auth', shopAuthRouter);
shopRouter.use('/checkout', checkoutRouter);

/** Home screen: categories, deals and featured products in one call. */
shopRouter.get(
  '/home',
  asyncHandler(async (req, res) => {
    const { db, tenant } = requireTenantContext(req);

    const payload = await cached(tenantKey(tenant.slug, 'shop', 'home'), defaultTtl, async () => {
      const [brands, products, typeCounts] = await Promise.all([
        db.brand.findMany({
          include: { _count: { select: { products: true } } },
          orderBy: { name: 'asc' },
        }),
        db.product.findMany({
          where: { isActive: true },
          include: {
            brand: true,
            images: { orderBy: { position: 'asc' }, take: 1 },
            skus: { where: { isActive: true }, include: { inventory: true }, orderBy: { basePriceCents: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        }),
        db.product.groupBy({ by: ['type'], _count: { _all: true }, where: { isActive: true } }),
      ]);

      // "Deals" are the SKUs whose compare-at price is genuinely higher.
      const deals = products
        .filter((p) => p.skus.some((s) => s.compareAtCents && s.compareAtCents > s.basePriceCents))
        .slice(0, 4);

      return {
        categories: typeCounts.map((t) => ({ type: t.type, count: t._count._all })),
        brands: brands.map((b) => ({ name: b.name, slug: b.slug, products: b._count.products })),
        featured: products.slice(0, 8),
        deals,
      };
    });

    res.json({ ...payload, store: tenant });
  }),
);

const listQuery = z.object({
  type: z.enum(['TIRE', 'WHEEL', 'ACCESSORY']).optional(),
  brand: z.string().optional(),
  q: z.string().optional(),
  width: z.coerce.number().int().optional(),
  ratio: z.coerce.number().int().optional(),
  rim: z.coerce.number().int().optional(),
  bolt: z.string().optional(),
  minPrice: z.coerce.number().int().optional(),
  maxPrice: z.coerce.number().int().optional(),
  sort: z.enum(['newest', 'price-asc', 'price-desc', 'name']).default('newest'),
});

/** Product listing with the fitment filters the sidebar needs. */
shopRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);
    const q = listQuery.parse(req.query);

    const skuFilter = {
      ...(q.width ? { sectionWidthMm: q.width } : {}),
      ...(q.ratio ? { aspectRatio: q.ratio } : {}),
      ...(q.rim ? { rimDiameterIn: q.rim } : {}),
      ...(q.bolt ? { boltPattern: q.bolt } : {}),
      ...(q.minPrice != null || q.maxPrice != null
        ? {
            basePriceCents: {
              ...(q.minPrice != null ? { gte: q.minPrice * 100 } : {}),
              ...(q.maxPrice != null ? { lte: q.maxPrice * 100 } : {}),
            },
          }
        : {}),
    };
    const hasSkuFilter = Object.keys(skuFilter).length > 0;

    const products = await db.product.findMany({
      where: {
        isActive: true,
        ...(q.type ? { type: q.type } : {}),
        ...(q.brand ? { brand: { slug: q.brand } } : {}),
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' as const } },
                { brand: { name: { contains: q.q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
        ...(hasSkuFilter ? { skus: { some: { isActive: true, ...skuFilter } } } : {}),
      },
      include: {
        brand: true,
        images: { orderBy: { position: 'asc' }, take: 1 },
        skus: {
          where: { isActive: true, ...skuFilter },
          include: { inventory: true },
          orderBy: { basePriceCents: 'asc' },
        },
      },
      orderBy:
        q.sort === 'name'
          ? { name: 'asc' }
          : q.sort === 'newest'
            ? { createdAt: 'desc' }
            : { name: 'asc' },
      take: 60,
    });

    // Price sorts run on the cheapest SKU, which SQL cannot order by directly.
    const cheapest = (p: (typeof products)[number]) => p.skus[0]?.basePriceCents ?? Infinity;
    if (q.sort === 'price-asc') products.sort((a, b) => cheapest(a) - cheapest(b));
    if (q.sort === 'price-desc') products.sort((a, b) => cheapest(b) - cheapest(a));

    // Facets for the filter sidebar, from the unfiltered catalog.
    const [brands, sizes] = await Promise.all([
      db.brand.findMany({ orderBy: { name: 'asc' } }),
      db.sku.findMany({
        where: { isActive: true },
        select: { rimDiameterIn: true, sectionWidthMm: true, boltPattern: true },
      }),
    ]);

    res.json({
      products,
      total: products.length,
      facets: {
        brands: brands.map((b) => ({ name: b.name, slug: b.slug })),
        rimDiameters: [...new Set(sizes.map((s) => s.rimDiameterIn).filter(Boolean))].sort(
          (a, b) => (a as number) - (b as number),
        ),
        widths: [...new Set(sizes.map((s) => s.sectionWidthMm).filter(Boolean))].sort(
          (a, b) => (a as number) - (b as number),
        ),
        boltPatterns: [...new Set(sizes.map((s) => s.boltPattern).filter(Boolean))].sort(),
      },
    });
  }),
);

shopRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);

    const product = await db.product.findFirst({
      where: { slug: req.params.slug!, isActive: true },
      include: {
        brand: true,
        images: { orderBy: { position: 'asc' } },
        skus: {
          where: { isActive: true },
          include: { inventory: true, fitments: { include: { vehicle: true } } },
          orderBy: { basePriceCents: 'asc' },
        },
      },
    });
    if (!product) throw notFound('Product not found');

    // Same type and brand as a simple 'you may also like'.
    const related = await db.product.findMany({
      where: { isActive: true, type: product.type, id: { not: product.id } },
      include: { brand: true, skus: { take: 1, orderBy: { basePriceCents: 'asc' } } },
      take: 4,
    });

    res.json({ product, related });
  }),
);

/** The shopper's own orders. */
shopRouter.get(
  '/orders',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);

    const orders = await db.order.findMany({
      where: { customerId: req.customer!.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const ACTIVE = ['AWAITING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED'];
    res.json({
      active: orders.filter((o) => ACTIVE.includes(o.status)),
      past: orders.filter((o) => !ACTIVE.includes(o.status)),
    });
  }),
);

shopRouter.get(
  '/orders/:id',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { db } = requireTenantContext(req);

    const order = await db.order.findFirst({
      // Scoped by customerId, so one shopper cannot read another's order.
      where: { id: req.params.id!, customerId: req.customer!.id },
      include: {
        items: { include: { sku: { include: { product: true } } } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw notFound('Order not found');

    res.json(order);
  }),
);
