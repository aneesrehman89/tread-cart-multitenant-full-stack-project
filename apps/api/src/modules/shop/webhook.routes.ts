import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { controlDb } from '../../db/control.js';
import { getTenantClient } from '../../db/tenant-registry.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { markOrderPaid, stripe } from './checkout.routes.js';

// Raw body (mounted before express.json) for signature checks; tenant comes from event metadata.
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe is not configured' });
    return;
  }

  const signature = req.header('stripe-signature');
  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // An unverifiable event is not ours; never act on it.
    logger.warn({ err }, 'rejected a Stripe webhook with an invalid signature');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const tenantSlug = session.metadata?.tenantSlug;
  const orderId = session.metadata?.orderId;

  if (!tenantSlug || !orderId) {
    // Acknowledge, or Stripe retries forever on an event we can never handle.
    logger.warn({ type: event.type, id: event.id }, 'Stripe event without tenant metadata');
    res.json({ received: true, ignored: 'missing metadata' });
    return;
  }

  const tenant = await controlDb.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    logger.warn({ tenantSlug, id: event.id }, 'Stripe event for an unknown tenant');
    res.json({ received: true, ignored: 'unknown tenant' });
    return;
  }

  const db = await getTenantClient(tenant.id, tenant.databaseUrl);

  // Inserting the event id first makes processing idempotent.
  try {
    await db.processedWebhook.create({ data: { id: event.id, type: event.type } });
  } catch {
    logger.info({ id: event.id }, 'Stripe event already processed, skipping');
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (session.payment_status === 'paid' || event.type === 'checkout.session.completed') {
          await db.order.update({
            where: { id: orderId },
            data: {
              stripePaymentIntentId:
                typeof session.payment_intent === 'string' ? session.payment_intent : null,
            },
          });
          await markOrderPaid(db, orderId, tenantSlug);
          logger.info({ orderId, tenantSlug }, 'order marked paid from Stripe');
        }
        break;
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        // Release the stock this abandoned checkout was holding.
        const order = await db.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (order && order.status === 'AWAITING_PAYMENT') {
          await db.$transaction(async (tx) => {
            for (const item of order.items) {
              await tx.inventoryItem.update({
                where: { skuId: item.skuId },
                data: { reserved: { decrement: item.quantity } },
              });
            }
            await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
            await tx.orderEvent.create({
              data: { orderId, status: 'CANCELLED', note: 'Checkout expired or payment failed' },
            });
          });
          logger.info({ orderId, tenantSlug }, 'released stock for an abandoned checkout');
        }
        break;
      }

      default:
        logger.debug({ type: event.type }, 'unhandled Stripe event type');
    }
  } catch (err) {
    // Undo the idempotency claim so Stripe's retry can have another go.
    await db.processedWebhook.delete({ where: { id: event.id } }).catch(() => undefined);
    logger.error({ err, id: event.id }, 'failed to handle a Stripe event');
    res.status(500).json({ error: 'Handler failed' });
    return;
  }

  res.json({ received: true });
}
