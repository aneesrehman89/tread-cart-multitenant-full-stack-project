import type { Mail } from './mailer.js';

/**
 * Email templates.
 *
 * Deliberately plain HTML with inline styles and a table-free layout: mail
 * clients strip <style> blocks, ignore most modern CSS, and Gmail clips
 * anything over ~102 KB. Every template also carries a text/plain part,
 * because a mail with no text part scores badly with spam filters.
 */

const BRAND = '#0F5132';

function layout(opts: { title: string; brand?: string; body: string; footer?: string }): string {
  const brand = opts.brand ?? BRAND;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="padding:0 0 20px 0;">
        <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:${brand};color:#fff;font-weight:700;font-size:13px;">T</span>
        <span style="margin-left:8px;font-weight:600;font-size:14px;color:#141a15;vertical-align:middle;">TreadCart</span>
      </div>

      <div style="background:#fff;border:1px solid #e2e6e0;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#141a15;">${opts.title}</h1>
        ${opts.body}
      </div>

      <p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#9aa397;text-align:center;">
        ${opts.footer ?? 'You received this because you have a TreadCart account.'}
      </p>
    </div>
  </body>
</html>`;
}

/** Big, monospaced, selectable — a code people copy on a phone. */
function codeBlock(code: string, brand = BRAND): string {
  return `<div style="margin:20px 0;padding:16px;background:#f0f7f3;border:1px solid #dcede3;border-radius:10px;text-align:center;">
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:7px;font-weight:700;color:${brand};">${code}</div>
  </div>`;
}

export function verificationEmail(opts: {
  to: string;
  name: string;
  code: string;
  purpose: 'seller-signup' | 'customer-signup';
}): Mail {
  const what =
    opts.purpose === 'seller-signup'
      ? 'finish setting up your seller account'
      : 'confirm your email address';

  return {
    to: opts.to,
    subject: `${opts.code} is your TreadCart verification code`,
    html: layout({
      title: 'Verify your email',
      body: `
        <p style="margin:0;font-size:14px;line-height:1.6;color:#4b554a;">
          Hi ${escapeHtml(opts.name)}, use this code to ${what}.
        </p>
        ${codeBlock(opts.code)}
        <p style="margin:0;font-size:12px;line-height:1.6;color:#6b756a;">
          The code expires in 30 minutes. If you didn't ask for it, you can ignore this email —
          nobody can use it without access to your inbox.
        </p>`,
    }),
    text: `Hi ${opts.name},\n\nYour TreadCart verification code is ${opts.code}.\n\nUse it to ${what}. It expires in 30 minutes.\n\nIf you didn't request this, you can ignore this email.`,
  };
}

export function orderConfirmationEmail(opts: {
  to: string;
  name: string | null;
  storeName: string;
  brand: string;
  orderNumber: string;
  items: { name: string; quantity: number; unitPriceCents: number }[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  orderUrl: string;
}): Mail {
  const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  const rows = opts.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;font-size:13px;color:#343c34;">${escapeHtml(i.name)} <span style="color:#9aa397;">× ${i.quantity}</span></td>
        <td style="padding:8px 0;font-size:13px;color:#141a15;text-align:right;white-space:nowrap;">${money(i.unitPriceCents * i.quantity)}</td>
      </tr>`,
    )
    .join('');

  const totalRow = (label: string, value: string, bold = false) =>
    `<tr>
      <td style="padding:4px 0;font-size:${bold ? '15' : '13'}px;color:${bold ? '#141a15' : '#6b756a'};${bold ? 'font-weight:600;' : ''}">${label}</td>
      <td style="padding:4px 0;font-size:${bold ? '15' : '13'}px;color:#141a15;text-align:right;${bold ? 'font-weight:600;' : ''}">${value}</td>
    </tr>`;

  return {
    to: opts.to,
    subject: `Order ${opts.orderNumber} confirmed — ${opts.storeName}`,
    html: layout({
      brand: opts.brand,
      title: 'Your order is confirmed',
      body: `
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b554a;">
          Thanks${opts.name ? ' ' + escapeHtml(opts.name) : ''} — ${escapeHtml(opts.storeName)} has your
          order <strong style="color:#141a15;">${opts.orderNumber}</strong> and payment has cleared.
          We'll email again when it ships.
        </p>

        <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #e2e6e0;margin-top:8px;">
          ${rows}
        </table>

        <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #e2e6e0;margin-top:12px;padding-top:8px;">
          ${totalRow('Subtotal', money(opts.subtotalCents))}
          ${totalRow('Delivery', opts.shippingCents === 0 ? 'FREE' : money(opts.shippingCents))}
          ${totalRow('Tax', money(opts.taxCents))}
          ${totalRow('Total', money(opts.totalCents), true)}
        </table>

        <div style="margin-top:24px;">
          <a href="${opts.orderUrl}" style="display:inline-block;background:${opts.brand};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
            Track your order
          </a>
        </div>`,
      footer: `Sent by ${escapeHtml(opts.storeName)} on TreadCart.`,
    }),
    text: `Order ${opts.orderNumber} confirmed\n\nThanks${opts.name ? ' ' + opts.name : ''} — ${opts.storeName} has your order and payment has cleared.\n\n${opts.items.map((i) => `  ${i.name} x${i.quantity}  ${money(i.unitPriceCents * i.quantity)}`).join('\n')}\n\nSubtotal ${money(opts.subtotalCents)}\nDelivery ${opts.shippingCents === 0 ? 'FREE' : money(opts.shippingCents)}\nTax ${money(opts.taxCents)}\nTotal ${money(opts.totalCents)}\n\nTrack your order: ${opts.orderUrl}`,
  };
}

export function applicationDecisionEmail(opts: {
  to: string;
  name: string;
  storeName: string;
  approved: boolean;
  note?: string | null;
  signInUrl: string;
}): Mail {
  return {
    to: opts.to,
    subject: opts.approved
      ? `${opts.storeName} is approved — you can start selling`
      : `About your TreadCart application`,
    html: layout({
      title: opts.approved ? 'Your store is approved' : 'Application not approved',
      body: opts.approved
        ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b554a;">
             Hi ${escapeHtml(opts.name)}, ${escapeHtml(opts.storeName)} is live on TreadCart.
             Sign in to add your catalog and start taking orders.
           </p>
           ${opts.note ? `<p style="margin:0 0 16px;font-size:13px;color:#6b756a;">${escapeHtml(opts.note)}</p>` : ''}
           <div style="margin-top:8px;">
             <a href="${opts.signInUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
               Sign in to your dashboard
             </a>
           </div>`
        : `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b554a;">
             Hi ${escapeHtml(opts.name)}, we weren't able to approve your application for
             ${escapeHtml(opts.storeName)}.
           </p>
           ${opts.note ? `<p style="margin:0;padding:12px;background:#f7f8f6;border-radius:8px;font-size:13px;line-height:1.6;color:#343c34;">${escapeHtml(opts.note)}</p>` : ''}`,
    }),
    text: opts.approved
      ? `Hi ${opts.name},\n\n${opts.storeName} is approved and live on TreadCart.\n\nSign in: ${opts.signInUrl}`
      : `Hi ${opts.name},\n\nWe weren't able to approve your application for ${opts.storeName}.\n\n${opts.note ?? ''}`,
  };
}

/** Anything interpolated into the HTML is user-supplied, so it is escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
