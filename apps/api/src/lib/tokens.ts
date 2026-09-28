import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { env } from '../config/env.js';

// Opaque random tokens: no claims, revocable with one row update, stored only as a peppered hash.

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256')
    .update(`${token}${env.AUTH_TOKEN_PEPPER}`)
    .digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// HMAC-signed checkout payload so totals can't be edited client-side.
export interface CheckoutIntentPayload {
  tenantId: string;
  orderId: string;
  totalCents: number;
  currency: string;
  expiresAt: number;
}

export function signCheckoutIntent(payload: CheckoutIntentPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', env.CHECKOUT_SIGNING_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyCheckoutIntent(token: string): CheckoutIntentPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = createHmac('sha256', env.CHECKOUT_SIGNING_SECRET)
    .update(body)
    .digest('base64url');
  if (!safeEqual(sig, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as CheckoutIntentPayload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
