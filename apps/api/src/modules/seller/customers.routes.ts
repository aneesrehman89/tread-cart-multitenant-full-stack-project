import { Router } from 'express';
import { z } from 'zod';
import { sellerContext } from '../../middleware/seller-tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { requirePermission } from '../../middleware/rbac.js';
import { conflict, notFound } from '../../lib/errors.js';
import { invalidatePricing } from '../pricing/pricing.service.js';

export const sellerCustomersRouter: Router = Router();

sellerCustomersRouter.get(
  '/',
  requirePermission('customer:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const q = z.object({ q: z.string().optional() }).parse(req.query);

    const customers = await db.customer.findMany({
      where: q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { firstName: { contains: q.q, mode: 'insensitive' } },
              { lastName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {},
      include: { group: true, _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json({ customers });
  }),
);

sellerCustomersRouter.patch(
  '/:id',
  requirePermission('customer:write'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const body = z
      .object({
        groupId: z.string().nullable().optional(),
        firstName: z.string().max(80).nullable().optional(),
        lastName: z.string().max(80).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
      })
      .parse(req.body);

    const customer = await db.customer.findUnique({ where: { id: req.params.id! } });
    if (!customer) throw notFound('Customer not found');

    if (body.groupId) {
      const group = await db.customerGroup.findUnique({ where: { id: body.groupId } });
      if (!group) throw notFound('That pricing group does not exist');
    }

    const updated = await db.customer.update({
      where: { id: customer.id },
      data: body,
      include: { group: true },
    });
    res.json(updated);
  }),
);

// --- Pricing groups -------------------------------------------------------

sellerCustomersRouter.get(
  '/groups',
  requirePermission('pricing:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const groups = await db.customerGroup.findMany({
      include: { _count: { select: { customers: true, prices: true } } },
      orderBy: { priority: 'desc' },
    });
    res.json({ groups });
  }),
);

const groupSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().regex(/^[A-Z0-9_]{2,30}$/, 'Uppercase letters, digits and underscores'),
  defaultDiscountBps: z.number().int().min(0).max(10_000),
  priority: z.number().int().min(0).max(1000).default(0),
});

sellerCustomersRouter.post(
  '/groups',
  requirePermission('pricing:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = groupSchema.parse(req.body);

    if (await db.customerGroup.findUnique({ where: { code: body.code } })) {
      throw conflict(`A group with code "${body.code}" already exists`);
    }

    const group = await db.customerGroup.create({ data: body });
    await invalidatePricing(tenant.slug);
    res.status(201).json(group);
  }),
);

sellerCustomersRouter.patch(
  '/groups/:id',
  requirePermission('pricing:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = groupSchema.partial().parse(req.body);

    const group = await db.customerGroup.findUnique({ where: { id: req.params.id! } });
    if (!group) throw notFound('Group not found');

    const updated = await db.customerGroup.update({ where: { id: group.id }, data: body });
    await invalidatePricing(tenant.slug, group.id);
    res.json(updated);
  }),
);

// --- SKU-level pricing ----------------------------------------------------

sellerCustomersRouter.get(
  '/groups/:id/prices',
  requirePermission('pricing:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const group = await db.customerGroup.findUnique({ where: { id: req.params.id! } });
    if (!group) throw notFound('Group not found');

    const prices = await db.customerGroupPrice.findMany({
      where: { groupId: group.id },
      include: { sku: { include: { product: true } } },
      orderBy: [{ skuId: 'asc' }, { minQuantity: 'asc' }],
    });

    res.json({ group, prices });
  }),
);

const priceSchema = z
  .object({
    skuId: z.string().min(1),
    minQuantity: z.number().int().min(1).default(1),
    priceCents: z.number().int().min(0).nullable().optional(),
    discountBps: z.number().int().min(0).max(10_000).nullable().optional(),
  })
  .refine((v) => v.priceCents != null || v.discountBps != null, {
    message: 'Set either a fixed price or a discount',
    path: ['priceCents'],
  });

sellerCustomersRouter.post(
  '/groups/:id/prices',
  requirePermission('pricing:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);
    const body = priceSchema.parse(req.body);

    const group = await db.customerGroup.findUnique({ where: { id: req.params.id! } });
    if (!group) throw notFound('Group not found');
    if (!(await db.sku.findUnique({ where: { id: body.skuId } }))) throw notFound('SKU not found');

    // A fixed price wins over a discount, so storing both would be ambiguous.
    const row = await db.customerGroupPrice.upsert({
      where: {
        groupId_skuId_minQuantity: {
          groupId: group.id,
          skuId: body.skuId,
          minQuantity: body.minQuantity,
        },
      },
      create: {
        groupId: group.id,
        skuId: body.skuId,
        minQuantity: body.minQuantity,
        priceCents: body.priceCents ?? null,
        discountBps: body.priceCents != null ? null : (body.discountBps ?? null),
      },
      update: {
        priceCents: body.priceCents ?? null,
        discountBps: body.priceCents != null ? null : (body.discountBps ?? null),
      },
      include: { sku: { include: { product: true } } },
    });

    await invalidatePricing(tenant.slug, group.id);
    res.status(201).json(row);
  }),
);

sellerCustomersRouter.delete(
  '/groups/:groupId/prices/:priceId',
  requirePermission('pricing:write'),
  asyncHandler(async (req, res) => {
    const { db, tenant } = sellerContext(req);

    const row = await db.customerGroupPrice.findUnique({ where: { id: req.params.priceId! } });
    if (!row) throw notFound('Price override not found');

    await db.customerGroupPrice.delete({ where: { id: row.id } });
    await invalidatePricing(tenant.slug, row.groupId);
    res.status(204).end();
  }),
);
