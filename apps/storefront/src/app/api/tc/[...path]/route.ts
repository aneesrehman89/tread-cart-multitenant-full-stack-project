import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/session';

// Proxies to the API and keeps the opaque token in an httpOnly cookie, out of browser JS.

const API_URL = process.env.TREADCART_API_URL ?? 'http://localhost:4000';

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const suffix = path.join('/');
  // Customer OAuth routes sit outside the tenant-scoped /shop routes.
  const base = suffix.startsWith('auth/google') ? 'customer' : 'shop';
  const url = new URL(`${API_URL}/v1/${base}/${suffix}`);
  url.search = req.nextUrl.search;

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // Which store this storefront is. The API scopes every query to it.
    'x-tenant-slug': process.env.TREADCART_STORE ?? 'apexauto',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  // Forward client identity so sessions record the real device, not this proxy.
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

  // Upstream may return HTML on errors, so don't assume JSON.
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { code: 'bad_upstream', message: text.slice(0, 500) } };
    }
  }

  // 204/304 must not carry a body; NextResponse.json() would throw.
  if (upstream.status === 204 || upstream.status === 304) {
    const empty = new NextResponse(null, { status: upstream.status });
    if (suffix === 'auth/logout') empty.cookies.delete(SESSION_COOKIE);
    return empty;
  }

  const res = NextResponse.json(payload, { status: upstream.status });

  // Capture the token on a successful sign-in; clear it on sign-out.
  const issuesSession =
    suffix === 'auth/login' || suffix === 'auth/register' || suffix === 'auth/google/exchange';
  const session = payload as { token?: string; expiresAt?: string } | null;
  if (issuesSession && upstream.ok && session?.token) {
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: session.expiresAt ? new Date(session.expiresAt) : undefined,
    });
    // Strip the token from the body so it never reaches the browser at all.
    return NextResponse.json({ ...session, token: undefined }, {
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
