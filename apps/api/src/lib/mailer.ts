import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// Backend is resend, smtp, or log. The log backend returns delivered=false so the UI never claims a send.

export type MailBackend = 'resend' | 'smtp' | 'log';

export interface MailResult {
  delivered: boolean;
  backend: MailBackend;
  error?: string;
}

export function mailBackend(): MailBackend {
  if (env.RESEND_API_KEY.startsWith('re_')) return 'resend';
  if (env.SMTP_HOST && env.SMTP_USER) return 'smtp';
  return 'log';
}

export function mailConfigured(): boolean {
  return mailBackend() !== 'log';
}

let transporter: Transporter | null = null;

function smtpTransport(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const backend = mailBackend();
  const from = env.MAIL_FROM;

  if (backend === 'log') {
    logger.warn(
      { to: mail.to, subject: mail.subject },
      'email NOT sent — no provider configured (set RESEND_API_KEY or SMTP_*)',
    );
    logger.info({ to: mail.to, body: mail.text }, 'email that would have been sent');
    return { delivered: false, backend };
  }

  try {
    if (backend === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 200)}`);
      }
    } else {
      await smtpTransport().sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    }

    logger.info({ to: mail.to, subject: mail.subject, backend }, 'email sent');
    return { delivered: true, backend };
  } catch (err) {
    // A mail failure must never fail the calling request.
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: mail.to, backend }, 'email send failed');
    return { delivered: false, backend, error: message };
  }
}
