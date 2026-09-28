import { redis } from './redis.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

// Keys are tenant-prefixed because Redis is shared across tenants.
export function tenantKey(tenantSlug: string, ...parts: (string | number)[]): string {
  return `t:${tenantSlug}:${parts.join(':')}`;
}

/** Read-through: return the cached value, or compute, store and return it. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    // A cache outage must not take the API down; fall through to the database.
    logger.warn({ err, key }, 'cache read failed, falling back to origin');
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'cache write failed');
  }

  return value;
}

// Write-through: persist, then refresh the cache with the written value.
export async function writeThrough<T>(
  key: string,
  ttlSeconds: number,
  write: () => Promise<T>,
): Promise<T> {
  const value = await write();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    // If we cannot refresh, drop the key so the next read re-hydrates it.
    logger.warn({ err, key }, 'write-through refresh failed, invalidating instead');
    await redis.del(key).catch(() => undefined);
  }
  return value;
}

// SCAN + UNLINK instead of KEYS to avoid blocking Redis.
export async function invalidatePrefix(prefix: string): Promise<number> {
  let cursor = '0';
  let removed = 0;

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 250);
    cursor = next;
    if (keys.length > 0) {
      await redis.unlink(...keys);
      removed += keys.length;
    }
  } while (cursor !== '0');

  return removed;
}

export const defaultTtl = env.CACHE_TTL_SECONDS;
