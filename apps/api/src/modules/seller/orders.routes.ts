import { Router } from 'express';
import { z } from 'zod';
import { sellerContext } from '../../middleware/seller-tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { requirePermission } from '../../middleware/rbac.js';
import { badRequest, notFound } from '../../lib/errors.js';
import type { OrderStatus } from '../../generated/tenant/index.js';

export const sellerOrdersRouter: Router = Router();

const listQuery = z.object({
  status: z
    .enum(['DRAFT', 'AWAITING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
    .optional(),
  q: z.string().optional(),
});

sellerOrdersRouter.get(
  '/',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const q = listQuery.parse(req.query);

    const orders = await db.order.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.q
          ? {
              OR: [
                { number: { contains: q.q, mode: 'insensitive' as const } },
                { email: { contains: q.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { items: true, customer: { include: { group: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const counts = await db.order.groupBy({ by: ['status'], _count: { _all: true } });

    res.json({
      orders,
      countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  }),
);

sellerOrdersRouter.get(
  '/:id',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const order = await db.order.findUnique({
      where: { id: req.params.id! },
      include: {
        items: { include: { sku: { include: { product: true } } } },
        customer: { include: { group: true, addresses: true } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw notFound('Order not found');
    res.json(order);
  }),
);

/**
 * Fulfilment moves an order forward one documented step at a time. An
 * arbitrary jump (delivered straight from paid, or reviving a cancelled
 * order) is rejected rather than silently accepted.
 */
const ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  PAID: ['FULFILLING', 'CANCELLED', 'REFUNDED'],
  FULFILLING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED'],
  DRAFT: ['AWAITING_PAYMENT', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};

const statusSchema = z.object({
  status: z.enum(['AWAITING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  note: z.string().max(500).optional(),
});

sellerOrdersRouter.post(
  '/:id/status',
  requirePermission('order:write'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const body = statusSchema.parse(req.body);

    const order = await db.order.findUnique({ where: { id: req.params.id! } });
    if (!order) throw notFound('Order not found');

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw badRequest(
        `Cannot move an order from ${order.status} to ${body.status}. Allowed: ${
          allowed.join(', ') || 'none — this order is final'
        }`,
      );
    }

    // The status change and its audit event are one unit: an order must never
    // move without a matching entry in its history.
    const [updated] = await db.$transaction([
      db.order.update({
        where: { id: order.id },
        data: {
          status: body.status,
          ...(body.status === 'PAID' && !order.paidAt ? { paidAt: new Date() } : {}),
        },
      }),
      db.orderEvent.create({
        data: { orderId: order.id, status: body.status, note: body.note ?? null },
      }),
    ]);

    res.json(updated);
  }),
);
