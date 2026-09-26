import { PrismaClient as TenantPrismaClient } from '../generated/tenant/index.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Per-tenant connection registry.
 *
 * Every tenant has its own Postgres database, so every tenant needs its own
 * PrismaClient (a client is bound to one connection string for its lifetime).
 * Creating one per request would open a fresh pool per request, so clients are
 * kept warm here and shared across requests for the same tenant.
 *
 * Two bounds keep this from exhausting Postgres:
 *   - TENANT_POOL_MAX_CLIENTS caps how many tenants are warm at once (LRU).
 *   - each client opens at most `connection_limit` connections (set below).
 * Worst case is MAX_CLIENTS * connection_limit sockets from this process, so
 * size those two against the server's max_connections before scaling up.
 */

interface Entry {
  client: TenantPrismaClient;
  lastUsedAt: number;
  /** Requests currently mid-flight on this client; never evict while > 0. */
  inFlight: number;
}

const CONNECTION_LIMIT = 3;

const registry = new Map<string, Entry>();

/** Appends pool sizing to the stored URL without clobbering existing params. */
function withPoolParams(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', String(CONNECTION_LIMIT));
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '10');
  }
  return parsed.toString();
}

async function evictLeastRecentlyUsed(): Promise<void> {
  let oldestKey: string | null = null;
  let oldestAt = Infinity;

  for (const [key, entry] of registry) {
    if (entry.inFlight > 0) continue;
    if (entry.lastUsedAt < oldestAt) {
      oldestAt = entry.lastUsedAt;
      oldestKey = key;
    }
  }

  if (oldestKey === null) {
    // Every warm client is busy. Let this request through rather than
    // rejecting it; the registry will settle once the burst passes.
    logger.warn({ size: registry.size }, 'tenant registry over capacity, all clients busy');
    return;
  }

  const victim = registry.get(oldestKey)!;
  registry.delete(oldestKey);
  await victim.client.$disconnect().catch((err: unknown) =>
    logger.warn({ err, tenantId: oldestKey }, 'failed to disconnect evicted tenant client'),
  );
  logger.debug({ tenantId: oldestKey }, 'evicted tenant client');
}

/** Returns the warm client for a tenant, creating one if needed. */
export async function getTenantClient(
  tenantId: string,
  databaseUrl: string,
): Promise<TenantPrismaClient> {
  const existing = registry.get(tenantId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }

  if (registry.size >= env.TENANT_POOL_MAX_CLIENTS) {
    await evictLeastRecentlyUsed();
  }

  const client = new TenantPrismaClient({
    datasources: { db: { url: withPoolParams(databaseUrl) } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  registry.set(tenantId, { client, lastUsedAt: Date.now(), inFlight: 0 });
  logger.debug({ tenantId, warmClients: registry.size }, 'opened tenant client');
  return client;
}

/** Marks a client busy so the idle sweeper and LRU leave it alone. */
export function acquire(tenantId: string): void {
  const entry = registry.get(tenantId);
  if (entry) {
    entry.inFlight += 1;
    entry.lastUsedAt = Date.now();
  }
}

export function release(tenantId: string): void {
  const entry = registry.get(tenantId);
  if (entry) {
    entry.inFlight = Math.max(0, entry.inFlight - 1);
    entry.lastUsedAt = Date.now();
  }
}

/** Drops a tenant's client immediately, e.g. after suspending the tenant. */
export async function dropTenantClient(tenantId: string): Promise<void> {
  const entry = registry.get(tenantId);
  if (!entry) return;
  registry.delete(tenantId);
  await entry.client.$disconnect().catch(() => undefined);
}

export function registryStats() {
  return {
    warmClients: registry.size,
    maxClients: env.TENANT_POOL_MAX_CLIENTS,
    connectionLimitPerClient: CONNECTION_LIMIT,
    tenants: [...registry.entries()].map(([tenantId, e]) => ({
      tenantId,
      inFlight: e.inFlight,
      idleMs: Date.now() - e.lastUsedAt,
    })),
  };
}

let sweeper: NodeJS.Timeout | null = null;

/** Closes clients that have sat idle, so quiet tenants release their sockets. */
export function startIdleSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const cutoff = Date.now() - env.TENANT_POOL_IDLE_MS;
    for (const [tenantId, entry] of registry) {
      if (entry.inFlight === 0 && entry.lastUsedAt < cutoff) {
        registry.delete(tenantId);
        void entry.client.$disconnect().catch(() => undefined);
        logger.debug({ tenantId }, 'swept idle tenant client');
      }
    }
  }, 60_000);
  sweeper.unref();
}

export async function closeAllTenantClients(): Promise<void> {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
  await Promise.all(
    [...registry.values()].map((e) => e.client.$disconnect().catch(() => undefined)),
  );
  registry.clear();
}
