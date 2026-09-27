import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireTenantContext } from '../../middleware/tenant.js';
import { requireCustomer } from './shop.auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { resolvePrices } from '../pricing/pricing.service.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/index.js';

export const checkoutRouter: Router = Router();

/**
 * A real Stripe secret key is `sk_test_` or `sk_live_` followed by a long
 * random string. The length check matters: the placeholder in .env.example is
 * `sk_test_xxx`, which passes a naive prefix test and then fails at the API
 * with an authentication error mid-checkout.
 */
export function stripeConfigured(): boolean {
  const key = env.STRIPE_SECRET_KEY;
  return /^sk_(test|live)_/.test(key) && key.length >= 30;
}

export const stripe = stripeConfigured()
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion })
  : null;

const TAX_BPS = 825; // 8.25%, flat for now — real tax needs a tax service.
const FREE_SHIPPING_OVER_CENTS = 50_000;
const SHIPPING_CENTS = 1_995;

const lineSchema = z.object({
  skuId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

/**
 * Prices a cart on the server.
 *
 * The browser sends SKU ids and quantities only. Prices, discounts, tax and
 * shipping are all resolved here against the customer's pricing group, so a
 * cart edited in devtools cannot change what anything costs.
 */
async function priceCart(
  db: TenantPrismaClient,
  tenantSlug: string,
  lines: { skuId: string; quantity: number }[],
  groupId: string | null,
) {
  const skus = await db.sku.findMany({
    where: { id: { in: lines.map((l) => l.skuId) }, isActive: true },
    include: { product: { include: { brand: true } }, inventory: true },
  });

  const bySku = new Map(skus.map((s) => [s.id, s]));
  const missing = lines.filter((l) => !bySku.has(l.skuId));
  if (missing.length > 0) {
    throw unprocessable('Some items are no longer available', { skuIds: missing.map((m) => m.skuId) });
  }

  // Stock is checked before payment, not after: taking money for something
  // that cannot ship is far worse than rejecting the checkout.
  const shortfalls = lines
    .map((l) => ({ line: l, sku: bySku.get(l.skuId)! }))
    .filter(({ line, sku }) => (sku.inventory?.onHand ?? 0) < line.quantity)
    .map(({ line, sku }) => ({
      skuId: line.skuId,
      name: sku.product.name,
      wanted: line.quantity,
      available: sku.inventory?.onHand ?? 0,
    }));

  if (shortfalls.length > 0) {
    throw unprocessable('Not enough stock for some items', { shortfalls });
  }

  const priced = await resolvePrices(db, tenantSlug, lines, groupId);
  const priceBySku = new Map(priced.map((p) => [p.skuId, p]));

  const items = lines.map((l) => {
    const sku = bySku.get(l.skuId)!;
    const price = priceBySku.get(l.skuId)!;
    return {
      skuId: l.skuId,
      sku: sku.sku,
      name: sku.product.name,
      brand: sku.product.brand.name,
      type: sku.product.type,
      quantity: l.quantity,
      unitPriceCents: price.unitPriceCents,
      listPriceCents: price.listPriceCents,
      lineTotalCents: price.unitPriceCents * l.quantity,
      discountCents: price.discountCents * l.quantity,
      appliedGroupId: price.appliedGroupId,
      reason: price.reason,
    };
  });

  const subtotalCents = items.reduce((a, i) => a + i.lineTotalCents, 0);
  const discountCents = items.reduce((a, i) => a + i.discountCents, 0);
  const shippingCents = subtotalCents >= FREE_SHIPPING_OVER_CENTS ? 0 : SHIPPING_CENTS;
  const taxCents = Math.round(subtotalCents * (TAX_BPS / 10_000));

  return {
    items,
    subtotalCents,
    discountCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
    currency: 'USD',
    freeShippingThresholdCents: FREE_SHIPPING_OVER_CENTS,
  };
}

/**
 * Live cart pricing. Called on every cart render so a guest sees list prices
 * and a signed-in trade customer sees their own, without the browser ever
 * computing a total.
 */
checkoutRouter.post(
  '/quote',
  asyncHandler(async (req, res) => {
    const { db, tenant } = requireTenantContext(req);
    const { lines } = z.object({ lines: z.array(lineSchema) }).parse(req.body);

    if (lines.length === 0) {
      res.json({
        items: [],
        subtotalCents: 0,
        discountCents: 0,
        taxCents: 0,
        shippingCents: 0,
        totalCents: 0,
        currency: 'USD',
        freeShippingThresholdCents: FREE_SHIPPING_OVER_CENTS,
      });
      return;
    }

    res.json(await priceCart(db, tenant.slug, lines, req.customer?.groupId ?? null));
  }),
);

const placeSchema = z.object({
  lines: z.array(lineSchema).min(1),
  addressId: z.string().optional(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().nullable().optional(),
      city: z.string().min(1),
      region: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().min(2).max(2).default('PK'),
    })
    .optional(),
});

/**
 * Creates the order and hands back a Stripe Checkout URL.
 *
 * The order is written first, in AWAITING_PAYMENT, so there is always a record
 * to reconcile a webhook against. Stock is reserved at the same time and only
 * decremented for real once payment confirms.
 */
checkoutRouter.post(
  '/place',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { db, tenant } = requireTenantContext(req);
    const body = placeSchema.parse(req.body);
    const customer = req.customer!;

    const quote = await priceCart(db, tenant.slug, body.lines, customer.groupId);

    // Resolve the shipping address: an existing one, or a new one to save.
    let addressId = body.addressId ?? null;
    if (!addressId && body.address) {
      const created = await db.address.create({
        data: { ...body.address, line2: body.address.line2 ?? null, customerId: customer.id },
      });
      addressId = created.id;
    }
    if (!addressId) throw badRequest('A delivery address is required');

    const address = await db.address.findFirst({
      where: { id: addressId, customerId: customer.id },
    });
    if (!address) throw notFound('That address does not belong to this account');

    const number = `TC-${Date.now().toString().slice(-8)}`;

    // The order and its stock reservation are one unit: an order must never
    // exist without the stock behind it being held.
    const order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          number,
          status: 'AWAITING_PAYMENT',
          customerId: customer.id,
          email: customer.email,
          subtotalCents: quote.subtotalCents,
          discountCents: quote.discountCents,
          taxCents: quote.taxCents,
          shippingCents: quote.shippingCents,
          totalCents: quote.totalCents,
          items: {
            create: quote.items.map((i) => ({
              skuId: i.skuId,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              listPriceCents: i.listPriceCents,
              appliedGroupId: i.appliedGroupId,
              nameSnapshot: i.name,
            })),
          },
          events: { create: { status: 'AWAITING_PAYMENT', note: 'Checkout started' } },
        },
        include: { items: true },
      });

      for (const line of quote.items) {
        await tx.inventoryItem.update({
          where: { skuId: line.skuId },
          data: { reserved: { increment: line.quantity } },
        });
      }

      return created;
    });

    if (!stripe) {
      // Without keys there is no way to take payment. Say so plainly rather
      // than pretending the order is paid.
      res.status(200).json({
        order: { id: order.id, number: order.number, totalCents: order.totalCents },
        paymentUrl: null,
        stripeConfigured: false,
        message:
          'Stripe is not configured. Set STRIPE_SECRET_KEY to a test key to complete payment.',
      });
      return;
    }

    // The order and its reservation are already committed at this point, so a
    // failure here must release them. Without this, a Stripe outage would
    // silently hold stock against orders that can never be paid.
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: customer.email,
        client_reference_id: order.id,
        // The webhook needs to know which store's database to write back to.
        metadata: { orderId: order.id, tenantSlug: tenant.slug },
        line_items: [
          ...quote.items.map((i) => ({
            quantity: i.quantity,
            price_data: {
              currency: 'usd',
              unit_amount: i.unitPriceCents,
              product_data: { name: i.name, description: `${i.brand} · ${i.sku}` },
            },
          })),
          ...(quote.shippingCents > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: 'usd',
                    unit_amount: quote.shippingCents,
                    product_data: { name: 'Shipping' },
                  },
                },
              ]
            : []),
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: quote.taxCents,
              product_data: { name: 'Tax' },
            },
          },
        ],
        success_url: `${env.STOREFRONT_URL}/orders/${order.id}?paid=1`,
        cancel_url: `${env.STOREFRONT_URL}/checkout?cancelled=1`,
      });
    } catch (err) {
      await releaseOrder(db, order.id, 'Payment could not be started');
      logger.error({ err, orderId: order.id }, 'Stripe session creation failed');
      throw unprocessable('Could not start payment. Your card was not charged — please try again.');
    }

    await db.order.update({
      where: { id: order.id },
      data: { stripeCheckoutId: session.id },
    });

    logger.info({ orderId: order.id, tenant: tenant.slug }, 'checkout session created');

    res.json({
      order: { id: order.id, number: order.number, totalCents: order.totalCents },
      paymentUrl: session.url,
      stripeConfigured: true,
    });
  }),
);

/**
 * Development-only: marks an order paid without Stripe.
 *
 * This exists so the checkout flow can be demonstrated before Stripe keys are
 * configured. It refuses to run in production, and refuses at all once Stripe
 * IS configured, so it can never become a way to skip payment.
 */
checkoutRouter.post(
  '/orders/:id/simulate-payment',
  requireCustomer,
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === 'production' || stripeConfigured()) {
      throw badRequest('Payment simulation is disabled. Complete the Stripe checkout instead.');
    }

    const { db } = requireTenantContext(req);
    const order = await db.order.findFirst({
      where: { id: req.params.id!, customerId: req.customer!.id },
      include: { items: true },
    });
    if (!order) throw notFound('Order not found');
    if (order.status !== 'AWAITING_PAYMENT') throw badRequest('This order is not awaiting payment');

    await markOrderPaid(db, order.id);
    res.json({ ok: true, simulated: true });
  }),
);

/**
 * Releases an unpaid order's stock reservation and cancels it. Used when
 * payment can never start, and mirrored by the webhook's expiry handling.
 */
export async function releaseOrder(
  db: TenantPrismaClient,
  orderId: string,
  note: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    if (order.status !== 'AWAITING_PAYMENT') return;

    for (const item of order.items) {
      await tx.inventoryItem.update({
        where: { skuId: item.skuId },
        data: { reserved: { decrement: item.quantity } },
      });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    await tx.orderEvent.create({ data: { orderId, status: 'CANCELLED', note } });
  });
}

/**
 * Turns a reservation into a real stock decrement and marks the order paid.
 * Shared by the Stripe webhook and the dev simulation so both behave the same.
 */
export async function markOrderPaid(db: TenantPrismaClient, orderId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });

    // Idempotent: a webhook can be delivered more than once.
    if (order.status !== 'AWAITING_PAYMENT') return;

    for (const item of order.items) {
      await tx.inventoryItem.update({
        where: { skuId: item.skuId },
        data: {
          onHand: { decrement: item.quantity },
          reserved: { decrement: item.quantity },
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await tx.orderEvent.create({
      data: { orderId, status: 'PAID', note: 'Payment confirmed' },
    });
  });
}
