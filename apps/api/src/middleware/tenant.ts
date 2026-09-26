import type { NextFunction, Request, Response } from 'express';
import { controlDb } from '../db/control.js';
import { acquire, getTenantClient, release } from '../db/tenant-registry.js';
import { redis } from '../cache/redis.js';
import { badRequest, notFound, forbidden } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { ResolvedTenant } from '../types/express.js';

const LOOKUP_TTL_SECONDS = 60;

interface CachedTenant extends ResolvedTenant {
  databaseUrl: string;
  status: string;
}

/**
 * Works out which tenant a request belongs to, in priority order:
 *   1. X-Tenant-Slug header  (server-to-server, local dev, tests)
 *   2. Host header           (custom domains and subdomains in production)
 *
 * In production you should trust only the Host header; the header override is
 * gated on a non-production NODE_ENV or an authenticated platform admin.
 */
function readTenantHint(req: Request): { kind: 'slug' | 'host'; value: string } | null {
  const slug = req.header('x-tenant-slug');
  if (slug) return { kind: 'slug', value: slug.trim().toLowerCase() };

  const host = req.hostname;
  if (host) return { kind: 'host', value: host.toLowerCase() };

  return null;
}

async function lookupTenant(
  hint: { kind: 'slug' | 'host'; value: string },
): Promise<CachedTenant | null> {
  const cacheKey = `tenant:lookup:${hint.kind}:${hint.value}`;

  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) return JSON.parse(hit) as CachedTenant;

  const record =
    hint.kind === 'slug'
      ? await controlDb.tenant.findUnique({ where: { slug: hint.value } })
      : await controlDb.tenant
          .findFirst({ where: { domains: { some: { host: hint.value } } } });

  if (!record) return null;

  const resolved: CachedTenant = {
    id: record.id,
    slug: record.slug,
    name: record.name,
    brandPrimary: record.brandPrimary,
    brandAccent: record.brandAccent,
    logoUrl: record.logoUrl,
    databaseUrl: record.databaseUrl,
    status: record.status,
  };

  await redis
    .set(cacheKey, JSON.stringify(resolved), 'EX', LOOKUP_TTL_SECONDS)
    .catch(() => undefined);

  return resolved;
}

/** Call after changing a tenant row so the next request sees it immediately. */
export async function invalidateTenantLookup(slug: string, hosts: string[] = []): Promise<void> {
  const keys = [`tenant:lookup:slug:${slug}`, ...hosts.map((h) => `tenant:lookup:host:${h}`)];
  await redis.unlink(...keys).catch(() => undefined);
}

export async function resolveTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const hint = readTenantHint(req);
    if (!hint) {
      throw badRequest('Could not determine tenant: send an X-Tenant-Slug header or use a tenant hostname');
    }

    const tenant = await lookupTenant(hint);
    if (!tenant) throw notFound(`Unknown tenant for ${hint.kind} "${hint.value}"`);

    if (tenant.status !== 'ACTIVE') {
      throw forbidden(`Tenant "${tenant.slug}" is ${tenant.status.toLowerCase()}`);
    }

    req.tenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      brandPrimary: tenant.brandPrimary,
      brandAccent: tenant.brandAccent,
      logoUrl: tenant.logoUrl,
    };
    req.db = await getTenantClient(tenant.id, tenant.databaseUrl);

    // Hold the client open for the life of the request so the LRU and the
    // idle sweeper cannot disconnect it mid-query.
    acquire(tenant.id);
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      release(tenant.id);
    };
    res.on('finish', done);
    res.on('close', done);

    logger.debug({ tenantId: tenant.id, slug: tenant.slug }, 'tenant resolved');
    next();
  } catch (err) {
    next(err);
  }
}

/** Narrows the optional request fields once resolveTenant has run. */
export function requireTenantContext(req: Request) {
  if (!req.tenant || !req.db) {
    throw badRequest('Tenant context missing; resolveTenant must run before this handler');
  }
  return { tenant: req.tenant, db: req.db };
}
