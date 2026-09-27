import { Router } from 'express';
import { z } from 'zod';
import { verify as verifyPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { env } from '../../config/env.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth, revokeSessionCache } from '../../middleware/auth.js';
import { requireTenantContext } from '../../middleware/tenant.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { unauthorized } from '../../lib/errors.js';
import { isProduction } from '../../config/env.js';

export const authRouter: Router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { tenant } = requireTenantContext(req);
    const { email, password } = loginSchema.parse(req.body);

    const user = await controlDb.staffUser.findFirst({
      where: { email: email.toLowerCase(), tenantId: tenant.id, isActive: true },
    });

    // Same response whether the address is unknown or the password is wrong,
    // so this endpoint cannot be used to enumerate accounts.
    // A Google-only account has no local hash and cannot sign in this way.
    const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) throw unauthorized('Invalid email or password');

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

    await controlDb.session.create({
      data: {
        tokenHash: hashToken(token),
        staffUserId: user.id,
        tenantId: tenant.id,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
        expiresAt,
      },
    });

    res.cookie('tc_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      expires: expiresAt,
    });

    res.json({
      // Returned once and never again; the server only keeps its hash.
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

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = req.actor!;
    res.json({
      id: actor.staffUserId,
      email: actor.email,
      role: actor.role,
      tenantId: actor.tenantId,
      permissions: permissionsFor(actor.role),
    });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await controlDb.session.update({
      where: { id: req.actor!.sessionId },
      data: { revokedAt: new Date() },
    });
    await revokeSessionCache(session.tokenHash);
    res.clearCookie('tc_session');
    res.status(204).end();
  }),
);
