import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Server-side proxy to the TreadCart platform API.
 *
 * The browser never sees the opaque API token. It is captured from the login
 * response here and stored in an httpOnly cookie on this app's own origin,
 * then replayed as a bearer header on every later call. That keeps the token
 * out of JavaScript entirely, which is the whole point of an opaque token, and
 * avoids needing third-party cookies between :3002 and :4000.
 */

const API_URL = process.env.TREADCART_API_URL ?? 'http://localhost:4000';

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const suffix = path.join('/');
  const url = new URL(`${API_URL}/v1/platform/${suffix}`);
  url.search = req.nextUrl.search;

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  // Pass the caller's identity through, or every session row would record this
  // proxy instead of the device that actually signed in.
  const ua = req.headers.get('user-agent');
  if (ua) headers['user-agent'] = ua;
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: req.method, headers, body, cache: 'no-store' });
  } catch {
    return NextResponse.json(
      { error: { code: 'api_unreachable', message: 'Could not reach the TreadCart API. Is it running on port 4000?' } },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  const payload = text ? JSON.parse(text) : null;
  const res = NextResponse.json(payload, { status: upstream.status });

  // Capture the token on a successful sign-in; clear it on sign-out.
  if (suffix === 'auth/login' && upstream.ok && payload?.token) {
    res.cookies.set(SESSION_COOKIE, payload.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
    });
    // Strip the token from the body so it never reaches the browser at all.
    return NextResponse.json({ ...payload, token: undefined }, {
      status: upstream.status,
      headers: res.headers,
    });
  }

  if (suffix === 'auth/logout') {
    res.cookies.delete(SESSION_COOKIE);
  }

  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
