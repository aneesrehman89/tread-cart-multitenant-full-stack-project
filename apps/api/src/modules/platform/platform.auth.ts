import { Router } from 'express';
import { z } from 'zod';
import { verify as verifyPassword, hash as hashPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { env, isProduction } from '../../config/env.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth, revokeSessionCache } from '../../middleware/auth.js';
import { requirePlatformAdmin } from '../../middleware/rbac.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { badRequest, notFound, unauthorized } from '../../lib/errors.js';

export const platformAuthRouter: Router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Platform sign-in. Unlike the tenant login this runs with no tenant context
 * at all, and only PLATFORM_ADMIN accounts (tenantId = null) can use it, so a
 * store owner cannot reach the platform console with their store credentials.
 */
platformAuthRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await controlDb.staffUser.findFirst({
      where: { email: email.toLowerCase(), tenantId: null, role: 'PLATFORM_ADMIN', isActive: true },
    });

    const ok = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) throw unauthorized('Invalid email or password');

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

    await controlDb.session.create({
      data: {
        tokenHash: hashToken(token),
        staffUserId: user.id,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
        expiresAt,
      },
    });

    res.cookie('tc_platform_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      expires: expiresAt,
    });

    res.json({
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: permissionsFor(user.role),
      },
    });
  }),
);

platformAuthRouter.use(requireAuth, requirePlatformAdmin);

platformAuthRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await controlDb.staffUser.findUniqueOrThrow({
      where: { id: req.actor!.staffUserId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    res.json({ ...user, permissions: permissionsFor(req.actor!.role) });
  }),
);

const profileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
});

platformAuthRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body);
    const user = await controlDb.staffUser.update({
      where: { id: req.actor!.staffUserId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
      },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json(user);
  }),
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Use at least 10 characters'),
});

platformAuthRouter.post(
  '/change-password',
  asyncHandler(async (req, res) => {
    const body = passwordSchema.parse(req.body);
    const user = await controlDb.staffUser.findUniqueOrThrow({
      where: { id: req.actor!.staffUserId },
    });

    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw unauthorized('Current password is incorrect');
    }

    await controlDb.staffUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });

    // Every other session is killed, since the old password may be compromised.
    const others = await controlDb.session.findMany({
      where: { staffUserId: user.id, revokedAt: null, id: { not: req.actor!.sessionId } },
    });
    await controlDb.session.updateMany({
      where: { id: { in: others.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
    await Promise.all(others.map((s) => revokeSessionCache(s.tokenHash)));

    res.json({ ok: true, otherSessionsRevoked: others.length });
  }),
);

/** Powers the "Active sessions" card: real rows, not decoration. */
platformAuthRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const sessions = await controlDb.session.findMany({
      where: { staffUserId: req.actor!.staffUserId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    });

    res.json({
      sessions: sessions.map((s) => ({ ...s, isCurrent: s.id === req.actor!.sessionId })),
    });
  }),
);

platformAuthRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    if (id === req.actor!.sessionId) {
      throw badRequest('Use logout to end the current session');
    }

    const session = await controlDb.session.findFirst({
      where: { id, staffUserId: req.actor!.staffUserId },
    });
    if (!session) throw notFound('Session not found');

    await controlDb.session.update({ where: { id }, data: { revokedAt: new Date() } });
    await revokeSessionCache(session.tokenHash);
    res.status(204).end();
  }),
);

/** "Sign out all other sessions". */
platformAuthRouter.post(
  '/sessions/revoke-others',
  asyncHandler(async (req, res) => {
    const others = await controlDb.session.findMany({
      where: { staffUserId: req.actor!.staffUserId, revokedAt: null, id: { not: req.actor!.sessionId } },
    });
    await controlDb.session.updateMany({
      where: { id: { in: others.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
    await Promise.all(others.map((s) => revokeSessionCache(s.tokenHash)));
    res.json({ revoked: others.length });
  }),
);

platformAuthRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const session = await controlDb.session.update({
      where: { id: req.actor!.sessionId },
      data: { revokedAt: new Date() },
    });
    await revokeSessionCache(session.tokenHash);
    res.clearCookie('tc_platform_session');
    res.status(204).end();
  }),
);
