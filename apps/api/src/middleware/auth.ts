import type { NextFunction, Request, Response } from 'express';
import { controlDb } from '../db/control.js';
import { redis } from '../cache/redis.js';
import { hashToken } from '../lib/tokens.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { AuthenticatedActor } from '../types/express.js';

/**
 * Sessions are cached in Redis keyed by the token hash so the hot path is one
 * Redis GET instead of a control-DB round trip. Revocation deletes the key and
 * stamps the row, so a revoked token dies on the next request either way.
 */
const SESSION_CACHE_TTL = 120;

const sessionKey = (tokenHash: string) => `session:${tokenHash}`;

function readBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  // Browser clients use an httpOnly cookie instead of a header. The platform
  // console uses its own cookie name so signing into a store does not also
  // sign you into the platform console in the same browser.
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.tc_platform_session ?? cookies?.tc_session ?? null;
}

async function loadActor(tokenHash: string): Promise<AuthenticatedActor | null> {
  const hit = await redis.get(sessionKey(tokenHash)).catch(() => null);
  if (hit) return JSON.parse(hit) as AuthenticatedActor;

  const session = await controlDb.session.findUnique({
    where: { tokenHash },
    include: { staffUser: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.staffUser.isActive) return null;

  const actor: AuthenticatedActor = {
    sessionId: session.id,
    staffUserId: session.staffUserId,
    email: session.staffUser.email,
    role: session.staffUser.role,
    tenantId: session.staffUser.tenantId,
  };

  // Never outlive the session itself.
  const remaining = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  await redis
    .set(sessionKey(tokenHash), JSON.stringify(actor), 'EX', Math.min(SESSION_CACHE_TTL, remaining))
    .catch(() => undefined);

  return actor;
}

export async function revokeSessionCache(tokenHash: string): Promise<void> {
  await redis.unlink(sessionKey(tokenHash)).catch(() => undefined);
}

/** Rejects the request unless a live opaque token is presented. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readBearerToken(req);
    if (!token) throw unauthorized();

    const actor = await loadActor(hashToken(token));
    if (!actor) throw unauthorized('Session is invalid or has expired');

    // A tenant-scoped user may never act on another tenant, whatever the
    // request said its tenant was. Platform admins are exempt by design.
    if (actor.tenantId && req.tenant && actor.tenantId !== req.tenant.id) {
      throw forbidden('This session does not belong to the requested tenant');
    }

    req.actor = actor;
    next();
  } catch (err) {
    next(err);
  }
}

/** Populates req.actor when a token is present, but never rejects. */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearerToken(req);
  if (!token) return next();
  try {
    req.actor = (await loadActor(hashToken(token))) ?? undefined;
  } catch {
    req.actor = undefined;
  }
  next();
}
