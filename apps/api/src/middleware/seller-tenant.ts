import type { NextFunction, Request, Response } from 'express';
import { controlDb } from '../db/control.js';
import { acquire, getTenantClient, release } from '../db/tenant-registry.js';
import { forbidden, unauthorized, badRequest } from '../lib/errors.js';

// Seller tenant comes from the session only, so a header can't point it at another store.
export async function resolveSellerTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.actor) throw unauthorized();
    if (!req.actor.tenantId) {
      throw forbidden('This account is not attached to a store');
    }

    const tenant = await controlDb.tenant.findUnique({ where: { id: req.actor.tenantId } });
    if (!tenant) throw forbidden('The store for this session no longer exists');
    if (tenant.status !== 'ACTIVE') {
      throw forbidden(`${tenant.name} is ${tenant.status.toLowerCase()}`);
    }

    req.tenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      brandPrimary: tenant.brandPrimary,
      brandAccent: tenant.brandAccent,
      logoUrl: tenant.logoUrl,
      fontFamily: tenant.fontFamily,
      buttonStyle: tenant.buttonStyle,
      buttonWeight: tenant.buttonWeight,
      cardStyle: tenant.cardStyle,
    };
    req.db = await getTenantClient(tenant.id, tenant.databaseUrl);

    acquire(tenant.id);
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      release(tenant.id);
    };
    res.on('finish', done);
    res.on('close', done);

    next();
  } catch (err) {
    next(err);
  }
}

/** Narrows the optional request fields once resolveSellerTenant has run. */
export function sellerContext(req: Request) {
  if (!req.tenant || !req.db || !req.actor) {
    throw badRequest('Seller context missing; resolveSellerTenant must run first');
  }
  return { tenant: req.tenant, db: req.db, actor: req.actor };
}
