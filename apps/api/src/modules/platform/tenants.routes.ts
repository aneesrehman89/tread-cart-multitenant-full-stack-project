import { Router } from 'express';
import { z } from 'zod';
import { hash as hashPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { fanout, withTenantBySlug } from '../../db/fanout.js';
import { dropTenantClient } from '../../db/tenant-registry.js';
import { invalidateTenantLookup } from '../../middleware/tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { conflict, notFound } from '../../lib/errors.js';
import { provisionTenant } from '../../scripts/provision-tenant.js';
import { cached, defaultTtl, invalidatePrefix } from '../../cache/cache.js';

export const tenantsRouter: Router = Router();

const PLATFORM_CACHE_PREFIX = 'platform:';

// Fan-out for per-store counts and revenue, cached.
tenantsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await cached(`${PLATFORM_CACHE_PREFIX}tenants:list`, 30, async () => {
      const [tenants, stats] = await Promise.all([
        controlDb.tenant.findMany({
          include: { domains: true, _count: { select: { staff: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        fanout(async (db) => {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const [orders, revenue, skus] = await Promise.all([
            db.order.count({ where: { createdAt: { gte: since } } }),
            db.order.aggregate({
              _sum: { totalCents: true },
              where: { status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED'] } },
            }),
            db.sku.count({ where: { isActive: true } }),
          ]);
          return { orders, revenueCents: revenue._sum.totalCents ?? 0, skus };
        }),
      ]);

      const byId = new Map(stats.map((s) => [s.tenantId, s]));

      return tenants.map((t) => {
        const s = byId.get(t.id);
        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          status: t.status,
          brandPrimary: t.brandPrimary,
          brandAccent: t.brandAccent,
          logoUrl: t.logoUrl,
          databaseName: t.databaseName,
          primaryHost: t.domains.find((d) => d.isPrimary)?.host ?? null,
          staffCount: t._count.staff,
          createdAt: t.createdAt,
          orders30d: s?.value?.orders ?? 0,
          revenueCents: s?.value?.revenueCents ?? 0,
          skuCount: s?.value?.skus ?? 0,
          // Non-null when that tenant's database could not be reached.
          statsError: s?.error ?? null,
        };
      });
    });

    res.json({ tenants: rows });
  }),
);

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, 'Lowercase letters, digits and hyphens'),
  name: z.string().min(1).max(120),
  host: z.string().min(1).optional(),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1),
  ownerPassword: z.string().min(10),
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** "Onboard store": provisions a database and seeds the owner account. */
tenantsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    if (await controlDb.tenant.findUnique({ where: { slug: body.slug } })) {
      throw conflict(`A store with slug "${body.slug}" already exists`);
    }

    const { id } = await provisionTenant({
      slug: body.slug,
      name: body.name,
      host: body.host,
      brandPrimary: body.brandPrimary,
      brandAccent: body.brandAccent,
    });

    await controlDb.staffUser.create({
      data: {
        email: body.ownerEmail.toLowerCase(),
        name: body.ownerName,
        passwordHash: await hashPassword(body.ownerPassword),
        role: 'TENANT_OWNER',
        tenantId: id,
      },
    });

    await invalidatePrefix(PLATFORM_CACHE_PREFIX);
    const tenant = await controlDb.tenant.findUniqueOrThrow({ where: { id } });
    res.status(201).json(tenant);
  }),
);

tenantsRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = req.params.slug!;
    const tenant = await controlDb.tenant.findUnique({
      where: { slug },
      include: { domains: true },
    });
    if (!tenant) throw notFound(`No store with slug "${slug}"`);

    const stats = await withTenantBySlug(slug, async (db) => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [orders30d, revenue, skuCount, productCount, customerCount, groupCount] =
        await Promise.all([
          db.order.count({ where: { createdAt: { gte: since } } }),
          db.order.aggregate({
            _sum: { totalCents: true },
            where: { status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED'] } },
          }),
          db.sku.count({ where: { isActive: true } }),
          db.product.count({ where: { isActive: true } }),
          db.customer.count(),
          db.customerGroup.count(),
        ]);
      return {
        orders30d,
        revenueCents: revenue._sum.totalCents ?? 0,
        skuCount,
        productCount,
        customerCount,
        groupCount,
      };
    });

    const staff = await controlDb.staffUser.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ tenant, stats, staff });
  }),
);

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED']).optional(),
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

tenantsRouter.patch(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = req.params.slug!;
    const body = updateSchema.parse(req.body);

    const existing = await controlDb.tenant.findUnique({
      where: { slug },
      include: { domains: true },
    });
    if (!existing) throw notFound(`No store with slug "${slug}"`);

    const tenant = await controlDb.tenant.update({ where: { slug }, data: body });

    // Clear the cached tenant lookup so suspension applies immediately.
    await invalidateTenantLookup(slug, existing.domains.map((d) => d.host));
    await invalidatePrefix(PLATFORM_CACHE_PREFIX);

    // Drop the warm pool for a store that is no longer allowed to serve.
    if (body.status && body.status !== 'ACTIVE') await dropTenantClient(existing.id);

    res.json(tenant);
  }),
);

/** Catalog tab on the store detail screen. */
tenantsRouter.get(
  '/:slug/catalog',
  asyncHandler(async (req, res) => {
    const slug = req.params.slug!;
    const result = await withTenantBySlug(slug, (db) =>
      db.product.findMany({
        include: {
          brand: true,
          skus: { include: { inventory: true }, orderBy: { basePriceCents: 'asc' } },
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
    if (result === null) throw notFound(`No store with slug "${slug}"`);
    res.json({ products: result });
  }),
);

/** Orders tab. */
tenantsRouter.get(
  '/:slug/orders',
  asyncHandler(async (req, res) => {
    const slug = req.params.slug!;
    const result = await withTenantBySlug(slug, (db) =>
      db.order.findMany({
        include: { items: true, customer: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
    if (result === null) throw notFound(`No store with slug "${slug}"`);
    res.json({ orders: result });
  }),
);

/** Customers tab, including which pricing group each one is in. */
tenantsRouter.get(
  '/:slug/customers',
  asyncHandler(async (req, res) => {
    const slug = req.params.slug!;
    const result = await withTenantBySlug(slug, async (db) => {
      const [customers, groups] = await Promise.all([
        db.customer.findMany({ include: { group: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
        db.customerGroup.findMany({
          include: { _count: { select: { customers: true, prices: true } } },
          orderBy: { priority: 'desc' },
        }),
      ]);
      return { customers, groups };
    });
    if (result === null) throw notFound(`No store with slug "${slug}"`);
    res.json(result);
  }),
);
