import { env } from '../config/env.js';
import { logger } from './logger.js';

// Twilio via plain fetch; returns delivered=false when unconfigured.

export interface SmsResult {
  delivered: boolean;
  error?: string;
}

export function smsConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured()) {
    logger.warn({ to }, 'SMS NOT sent — Twilio is not configured (set TWILIO_*)');
    logger.info({ to, body }, 'SMS that would have been sent');
    return { delivered: false };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization:
            'Basic ' +
            Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      // Trial accounts reject unverified recipients; that's config, not a bug.
      throw new Error(`Twilio responded ${res.status}: ${detail.slice(0, 250)}`);
    }

    logger.info({ to }, 'SMS sent');
    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, 'SMS send failed');
    return { delivered: false, error: message };
  }
}
