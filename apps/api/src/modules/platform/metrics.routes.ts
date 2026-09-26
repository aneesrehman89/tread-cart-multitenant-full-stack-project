import { Router } from 'express';
import { controlDb } from '../../db/control.js';
import { fanout } from '../../db/fanout.js';
import { asyncHandler } from '../../middleware/error.js';
import { cached } from '../../cache/cache.js';

export const metricsRouter: Router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID_STATUSES = ['PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED'] as const;

/**
 * Dashboard figures, aggregated across every tenant database.
 *
 * Cached for 60s: it is a fan-out of several queries per tenant, and the
 * numbers on a marketplace overview do not need to be second-accurate.
 */
metricsRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const payload = await cached('platform:metrics:dashboard', 60, async () => {
      const now = Date.now();
      const windowStart = new Date(now - 30 * DAY_MS);
      const prevStart = new Date(now - 60 * DAY_MS);

      const perTenant = await fanout(async (db) => {
        const [current, previous, orderCount, prevOrderCount, statusGroups, skus] =
          await Promise.all([
            db.order.aggregate({
              _sum: { totalCents: true },
              where: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: windowStart } },
            }),
            db.order.aggregate({
              _sum: { totalCents: true },
              where: {
                status: { in: [...PAID_STATUSES] },
                createdAt: { gte: prevStart, lt: windowStart },
              },
            }),
            db.order.count({ where: { createdAt: { gte: windowStart } } }),
            db.order.count({ where: { createdAt: { gte: prevStart, lt: windowStart } } }),
            db.order.groupBy({ by: ['status'], _count: { _all: true } }),
            db.sku.count({ where: { isActive: true } }),
          ]);

        // Daily buckets for the GMV trend chart.
        const daily = await db.order.findMany({
          where: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: windowStart } },
          select: { createdAt: true, totalCents: true },
        });

        return {
          gmvCents: current._sum.totalCents ?? 0,
          prevGmvCents: previous._sum.totalCents ?? 0,
          orderCount,
          prevOrderCount,
          statusGroups,
          skus,
          daily,
        };
      });

      const sum = (pick: (v: NonNullable<(typeof perTenant)[number]['value']>) => number) =>
        perTenant.reduce((acc, r) => acc + (r.value ? pick(r.value) : 0), 0);

      const gmvCents = sum((v) => v.gmvCents);
      const prevGmvCents = sum((v) => v.prevGmvCents);
      const orderCount = sum((v) => v.orderCount);
      const prevOrderCount = sum((v) => v.prevOrderCount);

      // Merge every tenant's orders into a trend series.
      //
      // Bucketed into multi-day periods rather than single days: at this order
      // volume a daily series is mostly zeros with isolated spikes, which reads
      // as noise instead of a trend. Each point is the total for BUCKET_DAYS.
      const BUCKET_DAYS = 3;
      const bucketCount = Math.ceil(30 / BUCKET_DAYS);
      const buckets = new Map<string, number>();

      // Key each bucket by the date it starts on.
      for (let i = bucketCount - 1; i >= 0; i -= 1) {
        const start = now - (i + 1) * BUCKET_DAYS * DAY_MS + DAY_MS;
        buckets.set(new Date(start).toISOString().slice(0, 10), 0);
      }
      const bucketKeys = [...buckets.keys()];

      for (const row of perTenant) {
        for (const order of row.value?.daily ?? []) {
          const ageDays = Math.floor((now - new Date(order.createdAt).getTime()) / DAY_MS);
          const index = bucketCount - 1 - Math.floor(ageDays / BUCKET_DAYS);
          const key = bucketKeys[index];
          if (key !== undefined) buckets.set(key, buckets.get(key)! + order.totalCents);
        }
      }

      const statusTotals = new Map<string, number>();
      for (const row of perTenant) {
        for (const g of row.value?.statusGroups ?? []) {
          statusTotals.set(g.status, (statusTotals.get(g.status) ?? 0) + g._count._all);
        }
      }

      const [activeTenants, totalTenants, pendingTenants, newThisMonth] = await Promise.all([
        controlDb.tenant.count({ where: { status: 'ACTIVE' } }),
        controlDb.tenant.count(),
        controlDb.tenant.count({ where: { status: 'PENDING' } }),
        controlDb.tenant.count({ where: { createdAt: { gte: windowStart } } }),
      ]);

      const topStores = [...perTenant]
        .filter((r) => r.value)
        .sort((a, b) => (b.value!.gmvCents ?? 0) - (a.value!.gmvCents ?? 0))
        .slice(0, 6)
        .map((r) => ({
          slug: r.slug,
          name: r.name,
          orders30d: r.value!.orderCount,
          revenueCents: r.value!.gmvCents,
          skus: r.value!.skus,
        }));

      return {
        windowDays: 30,
        gmv: { cents: gmvCents, deltaPct: pctChange(gmvCents, prevGmvCents) },
        orders: { count: orderCount, deltaPct: pctChange(orderCount, prevOrderCount) },
        tenants: { active: activeTenants, total: totalTenants, pending: pendingTenants, newThisMonth },
        skus: { total: sum((v) => v.skus) },
        gmvTrend: [...buckets.entries()].map(([date, cents]) => ({ date, cents })),
        ordersByStatus: [...statusTotals.entries()].map(([status, count]) => ({ status, count })),
        topStores,
        // Surfaced so a silently unreachable store is visible, not averaged away.
        degradedTenants: perTenant.filter((r) => r.error).map((r) => r.slug),
      };
    });

    res.json(payload);
  }),
);

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null renders as "new"
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
