import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/index.js';
import { cached, defaultTtl, invalidatePrefix, tenantKey } from '../../cache/cache.js';

export interface ResolvedPrice {
  skuId: string;
  quantity: number;
  listPriceCents: number;
  unitPriceCents: number;
  discountCents: number;
  currency: string;
  appliedGroupId: string | null;
  /** Why this price won, for the admin UI and for support tickets. */
  reason: 'base' | 'group-sku-fixed' | 'group-sku-discount' | 'group-default-discount';
}

// Resolution: group SKU price (fixed, else % off) for the best qty tier, then group default discount, then base price.
export async function resolvePrice(
  db: TenantPrismaClient,
  tenantSlug: string,
  args: { skuId: string; quantity: number; groupId: string | null },
): Promise<ResolvedPrice> {
  const { skuId, quantity, groupId } = args;

  const sku = await db.sku.findUniqueOrThrow({
    where: { id: skuId },
    select: { id: true, basePriceCents: true, currency: true },
  });

  const base: ResolvedPrice = {
    skuId,
    quantity,
    listPriceCents: sku.basePriceCents,
    unitPriceCents: sku.basePriceCents,
    discountCents: 0,
    currency: sku.currency,
    appliedGroupId: null,
    reason: 'base',
  };

  if (!groupId) return base;

  const group = await cached(
    tenantKey(tenantSlug, 'group', groupId),
    defaultTtl,
    () => db.customerGroup.findUnique({ where: { id: groupId } }),
  );
  if (!group) return base;

  const now = new Date();
  const tiers = await cached(
    tenantKey(tenantSlug, 'grouprice', groupId, skuId),
    defaultTtl,
    () =>
      db.customerGroupPrice.findMany({
        where: { groupId, skuId },
        orderBy: { minQuantity: 'desc' },
      }),
  );

  // Dates survive JSON as strings, so compare through the Date constructor.
  const tier = tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.startsAt === null || new Date(t.startsAt) <= now) &&
      (t.endsAt === null || new Date(t.endsAt) >= now),
  );

  if (tier?.priceCents != null) {
    return {
      ...base,
      unitPriceCents: tier.priceCents,
      discountCents: Math.max(0, sku.basePriceCents - tier.priceCents),
      appliedGroupId: groupId,
      reason: 'group-sku-fixed',
    };
  }

  const bps = tier?.discountBps ?? group.defaultDiscountBps;
  if (!bps) return base;

  const unit = applyBps(sku.basePriceCents, bps);
  return {
    ...base,
    unitPriceCents: unit,
    discountCents: sku.basePriceCents - unit,
    appliedGroupId: groupId,
    reason: tier?.discountBps != null ? 'group-sku-discount' : 'group-default-discount',
  };
}

/** Applies a basis-point discount, rounding half-up, never below zero. */
function applyBps(priceCents: number, bps: number): number {
  const discounted = Math.round(priceCents * (1 - bps / 10_000));
  return Math.max(0, discounted);
}

/** Prices a whole cart in one pass. */
export async function resolvePrices(
  db: TenantPrismaClient,
  tenantSlug: string,
  lines: { skuId: string; quantity: number }[],
  groupId: string | null,
): Promise<ResolvedPrice[]> {
  return Promise.all(
    lines.map((line) => resolvePrice(db, tenantSlug, { ...line, groupId })),
  );
}

// Drop group and catalog caches after any pricing write.
export async function invalidatePricing(tenantSlug: string, groupId?: string): Promise<void> {
  await Promise.all([
    invalidatePrefix(tenantKey(tenantSlug, 'grouprice', groupId ?? '')),
    groupId
      ? invalidatePrefix(tenantKey(tenantSlug, 'group', groupId))
      : invalidatePrefix(tenantKey(tenantSlug, 'group')),
    invalidatePrefix(tenantKey(tenantSlug, 'catalog')),
  ]);
}
