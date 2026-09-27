import { Router } from 'express';
import { z } from 'zod';
import { verify as verifyPassword } from '@node-rs/argon2';
import { controlDb } from '../../db/control.js';
import { env, isProduction } from '../../config/env.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth, revokeSessionCache } from '../../middleware/auth.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { forbidden, unauthorized } from '../../lib/errors.js';

export const sellerAuthRouter: Router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Only needed when one address is staff at more than one store. */
  storeSlug: z.string().optional(),
});

/**
 * Seller sign-in.
 *
 * Unlike the storefront API this takes no X-Tenant-Slug header: a seller
 * should not have to know their tenant slug to log in. The tenant is derived
 * from the staff record, and every later request reads it from the session, so
 * a seller cannot aim their session at another store by changing a header.
 */
sellerAuthRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password, storeSlug } = loginSchema.parse(req.body);

    const candidates = await controlDb.staffUser.findMany({
      where: {
        email: email.toLowerCase(),
        isActive: true,
        // Platform admins belong in the platform console, not a store dashboard.
        tenantId: { not: null },
        ...(storeSlug ? { tenant: { slug: storeSlug } } : {}),
      },
      include: { tenant: true },
    });

    // Verify a password before revealing anything, so this cannot be used to
    // enumerate which addresses are staff at which store.
    let matched: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      // A Google-only account has no hash to compare against; it must use
      // "Continue with Google" rather than a password.
      if (!candidate.passwordHash) continue;
      if (await verifyPassword(candidate.passwordHash, password)) {
        matched = candidate;
        break;
      }
    }
    if (!matched || !matched.tenant) throw unauthorized('Invalid email or password');

    // One address can be staff at several stores; ask which one.
    if (!storeSlug && candidates.length > 1) {
      const verified = [];
      for (const c of candidates) {
        if (c.passwordHash && (await verifyPassword(c.passwordHash, password))) {
          verified.push({ slug: c.tenant!.slug, name: c.tenant!.name });
        }
      }
      if (verified.length > 1) {
        res.status(300).json({ chooseStore: verified });
        return;
      }
    }

    if (matched.tenant.status !== 'ACTIVE') {
      throw forbidden(
        `${matched.tenant.name} is ${matched.tenant.status.toLowerCase()}. Contact platform support.`,
      );
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

    await controlDb.session.create({
      data: {
        tokenHash: hashToken(token),
        staffUserId: matched.id,
        tenantId: matched.tenantId,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
        expiresAt,
      },
    });

    res.cookie('tc_seller_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      expires: expiresAt,
    });

    res.json({
      token,
      expiresAt,
      user: {
        id: matched.id,
        name: matched.name,
        email: matched.email,
        role: matched.role,
        permissions: permissionsFor(matched.role),
      },
      store: {
        slug: matched.tenant.slug,
        name: matched.tenant.name,
        brandPrimary: matched.tenant.brandPrimary,
        brandAccent: matched.tenant.brandAccent,
        logoUrl: matched.tenant.logoUrl,
      },
    });
  }),
);

sellerAuthRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await controlDb.staffUser.findUniqueOrThrow({
      where: { id: req.actor!.staffUserId },
      include: { tenant: true },
    });
    if (!user.tenant) throw forbidden('This account is not attached to a store');

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsFor(user.role),
      store: {
        slug: user.tenant.slug,
        name: user.tenant.name,
        status: user.tenant.status,
        brandPrimary: user.tenant.brandPrimary,
        brandAccent: user.tenant.brandAccent,
        logoUrl: user.tenant.logoUrl,
        fontFamily: user.tenant.fontFamily,
        buttonStyle: user.tenant.buttonStyle,
        buttonWeight: user.tenant.buttonWeight,
        cardStyle: user.tenant.cardStyle,
      },
    });
  }),
);

sellerAuthRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await controlDb.session.update({
      where: { id: req.actor!.sessionId },
      data: { revokedAt: new Date() },
    });
    await revokeSessionCache(session.tokenHash);
    res.clearCookie('tc_seller_session');
    res.status(204).end();
  }),
);
