import type { PrismaClient as TenantPrismaClient } from '../generated/tenant/index.js';
import { controlDb } from './control.js';
import { getTenantClient, acquire, release } from './tenant-registry.js';
import { logger } from '../lib/logger.js';

/**
 * Runs a query against every active tenant database and collects the results.
 *
 * This is the cost of database-per-tenant: anything the platform admin needs
 * across stores is N queries instead of one GROUP BY. It is fine for the
 * hundreds of tenants this is sized for, and the results are cached upstream.
 * Past that, these numbers belong in a rollup table the tenants write to.
 */
export interface FanoutResult<T> {
  tenantId: string;
  slug: string;
  name: string;
  value: T | null;
  error?: string;
}

export async function fanout<T>(
  query: (db: TenantPrismaClient, tenant: { id: string; slug: string }) => Promise<T>,
  opts: { concurrency?: number } = {},
): Promise<FanoutResult<T>[]> {
  const tenants = await controlDb.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, name: true, databaseUrl: true },
    orderBy: { name: 'asc' },
  });

  const concurrency = opts.concurrency ?? 8;
  const results: FanoutResult<T>[] = [];

  // Bounded concurrency: one warm client per tenant is held for the duration,
  // so an unbounded fan-out would blow through the registry's LRU cap.
  for (let i = 0; i < tenants.length; i += concurrency) {
    const batch = tenants.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (t): Promise<FanoutResult<T>> => {
        try {
          const db = await getTenantClient(t.id, t.databaseUrl);
          acquire(t.id);
          try {
            return { tenantId: t.id, slug: t.slug, name: t.name, value: await query(db, t) };
          } finally {
            release(t.id);
          }
        } catch (err) {
          // One unreachable tenant must not blank the whole dashboard.
          logger.warn({ err, slug: t.slug }, 'fan-out query failed for tenant');
          return {
            tenantId: t.id,
            slug: t.slug,
            name: t.name,
            value: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    results.push(...settled);
  }

  return results;
}

/** Opens a client for one tenant by slug, for the tenant-detail screens. */
export async function withTenantBySlug<T>(
  slug: string,
  query: (db: TenantPrismaClient, tenant: { id: string; slug: string; name: string }) => Promise<T>,
): Promise<T | null> {
  const tenant = await controlDb.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;

  const db = await getTenantClient(tenant.id, tenant.databaseUrl);
  acquire(tenant.id);
  try {
    return await query(db, { id: tenant.id, slug: tenant.slug, name: tenant.name });
  } finally {
    release(tenant.id);
  }
}
