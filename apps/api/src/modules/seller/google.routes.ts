import { Router } from 'express';
import { z } from 'zod';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { controlDb } from '../../db/control.js';
import { env, isProduction } from '../../config/env.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import { asyncHandler } from '../../middleware/error.js';
import { badRequest, unprocessable } from '../../lib/errors.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { logger } from '../../lib/logger.js';
import { smsConfigured } from '../../lib/sms.js';

// Seller Google sign-in; Google-verified emails skip our email verification.
export const googleRouter: Router = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

// Signed state (nonce + expiry) guards the callback against CSRF without a server session.
function signState(): string {
  const payload = Buffer.from(
    JSON.stringify({ nonce: randomBytes(12).toString('hex'), exp: Date.now() + 10 * 60_000 }),
  ).toString('base64url');
  const sig = createHmac('sha256', env.AUTH_TOKEN_PEPPER).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(state: string): boolean {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return false;

  const expected = createHmac('sha256', env.AUTH_TOKEN_PEPPER).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number };
    return exp > Date.now();
  } catch {
    return false;
  }
}

/** Lets the frontend hide Google sign-in and the phone step when they aren't configured. */
googleRouter.get('/providers', (_req, res) => {
  res.json({ google: googleConfigured(), sms: smsConfigured() });
});

/** Step 1: send the seller to Google. */
googleRouter.get(
  '/google/start',
  asyncHandler(async (req, res) => {
    if (!googleConfigured()) {
      throw unprocessable(
        'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', signState());
    // Always ask, so switching Google accounts is possible.
    url.searchParams.set('prompt', 'select_account');

    // The browser is redirected; the frontend never handles the client secret.
    res.redirect(url.toString());
    void req;
  }),
);

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

async function exchangeCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw unprocessable(`Google rejected the authorization code (${tokenRes.status})`);
  }

  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw unprocessable('Google did not return an access token');

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw unprocessable('Could not read your Google profile');

  return (await profileRes.json()) as GoogleProfile;
}

googleRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(req.query);

    const back = (path: string) => res.redirect(`${env.SELLER_APP_URL}${path}`);

    if (error) return back(`/signup?error=${encodeURIComponent(error)}`);
    if (!code || !state) return back('/signup?error=missing_code');
    if (!verifyState(state)) return back('/signup?error=bad_state');

    const profile = await exchangeCode(code);
    if (!profile.email_verified) {
      return back('/signup?error=' + encodeURIComponent('Your Google email is not verified'));
    }

    const email = profile.email.toLowerCase();

    // Already a staff member at a live store: sign them straight in.
    const staff = await controlDb.staffUser.findFirst({
      where: { email, isActive: true, tenantId: { not: null } },
      include: { tenant: true },
    });

    if (staff?.tenant && staff.tenant.status === 'ACTIVE') {
      const token = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

      await controlDb.session.create({
        data: {
          tokenHash: hashToken(token),
          staffUserId: staff.id,
          tenantId: staff.tenantId,
          userAgent: req.header('user-agent') ?? null,
          ip: req.ip ?? null,
          expiresAt,
        },
      });

      // One-time token, swapped for an httpOnly cookie by the seller app.
      return back(`/auth/google?token=${encodeURIComponent(token)}`);
    }

    // Otherwise this is a signup. Reuse an existing draft, or start one.
    const existing = await controlDb.sellerApplication.findFirst({
      where: { OR: [{ email }, { googleId: profile.sub }] },
    });

    if (existing && existing.status !== 'DRAFT') {
      return back(`/signup/${existing.id}/status`);
    }

    const data = {
      email,
      googleId: profile.sub,
      contactName: profile.name ?? email.split('@')[0]!,
      avatarUrl: profile.picture ?? null,
      // Google has verified the address, so this step is already done.
      emailVerifiedAt: new Date(),
      emailCode: null,
    };

    const application = existing
      ? await controlDb.sellerApplication.update({ where: { id: existing.id }, data })
      : await controlDb.sellerApplication.create({ data });

    logger.info({ applicationId: application.id, email }, 'seller application started via Google');
    return back(`/signup?application=${application.id}`);
  }),
);

// Exchanges the one-time callback token for a session.
googleRouter.post(
  '/google/exchange',
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);

    const session = await controlDb.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { staffUser: { include: { tenant: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw badRequest('That sign-in link is no longer valid');
    }
    const { staffUser } = session;
    if (!staffUser.tenant) throw badRequest('This account is not attached to a store');

    res.cookie('tc_seller_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      expires: session.expiresAt,
    });

    res.json({
      token,
      expiresAt: session.expiresAt,
      user: {
        id: staffUser.id,
        name: staffUser.name,
        email: staffUser.email,
        role: staffUser.role,
        permissions: permissionsFor(staffUser.role),
      },
      store: {
        slug: staffUser.tenant.slug,
        name: staffUser.tenant.name,
        brandPrimary: staffUser.tenant.brandPrimary,
        brandAccent: staffUser.tenant.brandAccent,
      },
    });
  }),
);
