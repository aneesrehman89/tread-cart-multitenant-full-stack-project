import { Router } from 'express';
import { z } from 'zod';
import { sellerContext } from '../../middleware/seller-tenant.js';
import { asyncHandler } from '../../middleware/error.js';
import { requirePermission } from '../../middleware/rbac.js';

export const sellerDashboardRouter: Router = Router();

const DAY = 24 * 60 * 60 * 1000;
const PAID = ['PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED'] as const;

const rangeQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

sellerDashboardRouter.get(
  '/',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const { days } = rangeQuery.parse(req.query);

    const now = Date.now();
    const since = new Date(now - days * DAY);
    const prevSince = new Date(now - days * 2 * DAY);
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      ordersToday,
      revenue,
      prevRevenue,
      ordersInRange,
      prevOrders,
      pendingFulfilment,
      lowStock,
      recentOrders,
      paidInRange,
    ] = await Promise.all([
      db.order.count({ where: { createdAt: { gte: todayStart } } }),
      db.order.aggregate({
        _sum: { totalCents: true },
        where: { status: { in: [...PAID] }, createdAt: { gte: since } },
      }),
      db.order.aggregate({
        _sum: { totalCents: true },
        where: { status: { in: [...PAID] }, createdAt: { gte: prevSince, lt: since } },
      }),
      db.order.count({ where: { createdAt: { gte: since } } }),
      db.order.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      db.order.count({ where: { status: { in: ['PAID', 'FULFILLING'] } } }),
      // Prisma can't compare two columns, so onHand <= reorderAt is filtered in JS.
      db.inventoryItem.findMany({
        where: { onHand: { lte: 25 } },
        include: { sku: { include: { product: true } } },
        orderBy: { onHand: 'asc' },
        take: 50,
      }),
      db.order.findMany({
        where: { status: { in: ['PAID', 'FULFILLING'] } },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      db.order.findMany({
        where: { status: { in: [...PAID] }, createdAt: { gte: since } },
        select: { createdAt: true, totalCents: true },
      }),
    ]);

    // Daily sales series for the chart.
    const buckets = new Map<string, number>();
    const points = Math.min(days, 14);
    for (let i = points - 1; i >= 0; i -= 1) {
      buckets.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0);
    }
    for (const o of paidInRange) {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + o.totalCents);
    }

    const revenueCents = revenue._sum.totalCents ?? 0;
    const prevRevenueCents = prevRevenue._sum.totalCents ?? 0;

    res.json({
      windowDays: days,
      ordersToday,
      revenue: { cents: revenueCents, deltaPct: pct(revenueCents, prevRevenueCents) },
      orders: { count: ordersInRange, deltaPct: pct(ordersInRange, prevOrders) },
      pendingFulfilment,
      lowStock: lowStock
        .filter((i) => i.onHand <= i.reorderAt)
        .slice(0, 6)
        .map((i) => ({
          skuId: i.skuId,
          sku: i.sku.sku,
          name: i.sku.product.name,
          onHand: i.onHand,
          reorderAt: i.reorderAt,
        })),
      lowStockCount: lowStock.filter((i) => i.onHand <= i.reorderAt).length,
      salesTrend: [...buckets.entries()].map(([date, cents]) => ({ date, cents })),
      ordersToFulfil: recentOrders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        email: o.email,
        totalCents: o.totalCents,
        itemCount: o.items.reduce((a, i) => a + i.quantity, 0),
        createdAt: o.createdAt,
      })),
    });
  }),
);

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Reports screen: the same numbers broken out by product and by status. */
sellerDashboardRouter.get(
  '/reports',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const { db } = sellerContext(req);
    const { days } = rangeQuery.parse(req.query);
    const since = new Date(Date.now() - days * DAY);

    const [byStatus, items, totals, customerCount] = await Promise.all([
      db.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { totalCents: true },
        where: { createdAt: { gte: since } },
      }),
      db.orderItem.findMany({
        where: { order: { createdAt: { gte: since }, status: { in: [...PAID] } } },
        include: { sku: { include: { product: { include: { brand: true } } } } },
      }),
      db.order.aggregate({
        _sum: { totalCents: true, taxCents: true, shippingCents: true, discountCents: true },
        _avg: { totalCents: true },
        _count: { _all: true },
        where: { status: { in: [...PAID] }, createdAt: { gte: since } },
      }),
      db.customer.count(),
    ]);

    // Roll order lines up per SKU for the "top products" table.
    const perSku = new Map<string, { sku: string; name: string; brand: string; units: number; revenueCents: number }>();
    for (const item of items) {
      const key = item.skuId;
      const row = perSku.get(key) ?? {
        sku: item.sku.sku,
        name: item.sku.product.name,
        brand: item.sku.product.brand.name,
        units: 0,
        revenueCents: 0,
      };
      row.units += item.quantity;
      row.revenueCents += item.unitPriceCents * item.quantity;
      perSku.set(key, row);
    }

    res.json({
      windowDays: days,
      totals: {
        orders: totals._count._all,
        revenueCents: totals._sum.totalCents ?? 0,
        taxCents: totals._sum.taxCents ?? 0,
        shippingCents: totals._sum.shippingCents ?? 0,
        discountCents: totals._sum.discountCents ?? 0,
        averageOrderCents: Math.round(totals._avg.totalCents ?? 0),
        customers: customerCount,
      },
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count._all,
        revenueCents: s._sum.totalCents ?? 0,
      })),
      topProducts: [...perSku.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10),
    });
  }),
);
