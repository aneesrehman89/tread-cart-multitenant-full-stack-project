import { Router } from 'express';
import { z } from 'zod';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { controlDb } from '../../db/control.js';
import { getTenantClient } from '../../db/tenant-registry.js';
import { env, isProduction } from '../../config/env.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import { asyncHandler } from '../../middleware/error.js';
import { badRequest, unprocessable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { mailConfigured } from '../../lib/mailer.js';

/**
 * "Continue with Google" for shoppers.
 *
 * Mounted at /v1/customer, outside the tenant middleware, because Google
 * redirects the browser straight back to the API with no tenant header. The
 * store is carried through the signed `state` parameter instead — that is
 * also what stops the callback being replayable against a different store.
 */
export const customerGoogleRouter: Router = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function configured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

interface StatePayload {
  tenantSlug: string;
  /** Where in the storefront to return to, e.g. /checkout. */
  next: string;
  nonce: string;
  exp: number;
}

function signState(payload: Omit<StatePayload, 'nonce' | 'exp'>): string {
  const full: StatePayload = {
    ...payload,
    nonce: randomBytes(12).toString('hex'),
    exp: Date.now() + 10 * 60_000,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = createHmac('sha256', env.AUTH_TOKEN_PEPPER).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state: string): StatePayload | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;

  const expected = createHmac('sha256', env.AUTH_TOKEN_PEPPER).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

customerGoogleRouter.get('/auth/providers', (_req, res) => {
  // Also reports whether receipts can be emailed, so the storefront does not
  // claim to have sent one when no provider is configured.
  res.json({ google: configured(), email: mailConfigured() });
});

/** Step 1: hand the shopper to Google, remembering which store they were in. */
customerGoogleRouter.get(
  '/auth/google/start',
  asyncHandler(async (req, res) => {
    if (!configured()) {
      throw unprocessable('Google sign-in is not configured on this environment.');
    }

    const q = z
      .object({ tenant: z.string().min(1), next: z.string().optional() })
      .parse({ tenant: req.query.tenant ?? req.header('x-tenant-slug'), next: req.query.next });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_CUSTOMER_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set(
      'state',
      signState({ tenantSlug: q.tenant, next: sanitiseNext(q.next) }),
    );

    res.redirect(url.toString());
  }),
);

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
}

async function exchangeCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CUSTOMER_REDIRECT_URI,
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

/** Step 2: create or claim the customer in that store's database, then sign in. */
customerGoogleRouter.get(
  '/auth/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
      })
      .parse(req.query);

    const back = (path: string) => res.redirect(`${env.STOREFRONT_URL}${path}`);

    if (error) return back(`/account?error=${encodeURIComponent(error)}`);
    if (!code || !state) return back('/account?error=missing_code');

    const parsed = verifyState(state);
    if (!parsed) return back('/account?error=bad_state');

    const profile = await exchangeCode(code);
    if (!profile.email_verified) {
      return back('/account?error=' + encodeURIComponent('Your Google email is not verified'));
    }

    const tenant = await controlDb.tenant.findUnique({ where: { slug: parsed.tenantSlug } });
    if (!tenant || tenant.status !== 'ACTIVE') return back('/account?error=unknown_store');

    const db = await getTenantClient(tenant.id, tenant.databaseUrl);
    const email = profile.email.toLowerCase();

    // Claims an existing row if this address already shopped here as a guest,
    // so their order history carries over rather than forking.
    const existing = await db.customer.findUnique({ where: { email } });
    const customer = existing
      ? await db.customer.update({
          where: { id: existing.id },
          data: {
            firstName: existing.firstName ?? profile.given_name ?? null,
            lastName: existing.lastName ?? profile.family_name ?? null,
          },
        })
      : await db.customer.create({
          data: {
            email,
            firstName: profile.given_name ?? profile.name?.split(' ')[0] ?? null,
            lastName: profile.family_name ?? null,
          },
        });

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

    await db.customerSession.create({
      data: {
        tokenHash: hashToken(token),
        customerId: customer.id,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
        expiresAt,
      },
    });

    logger.info({ email, tenant: tenant.slug }, 'customer signed in with Google');

    // Handed over once in the URL, then swapped for an httpOnly cookie by the
    // storefront's own callback route.
    return back(
      `/auth/google?token=${encodeURIComponent(token)}&next=${encodeURIComponent(parsed.next)}`,
    );
  }),
);

/** Swaps the one-time token for a cookie-backed session. */
customerGoogleRouter.post(
  '/auth/google/exchange',
  asyncHandler(async (req, res) => {
    const { token, tenant: tenantSlug } = z
      .object({ token: z.string().min(10), tenant: z.string().min(1) })
      .parse({ ...req.body, tenant: req.body?.tenant ?? req.header('x-tenant-slug') });

    const tenant = await controlDb.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw badRequest('Unknown store');

    const db = await getTenantClient(tenant.id, tenant.databaseUrl);
    const session = await db.customerSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { customer: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw badRequest('That sign-in link is no longer valid');
    }

    res.cookie('tc_shopper_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      expires: session.expiresAt,
    });

    res.json({
      token,
      expiresAt: session.expiresAt,
      customer: {
        id: session.customer.id,
        email: session.customer.email,
        firstName: session.customer.firstName,
        lastName: session.customer.lastName,
      },
    });
  }),
);

/** Only same-origin storefront paths, so the callback cannot be an open redirect. */
function sanitiseNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/account';
  return next;
}
