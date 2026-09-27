'use client';

import Link from 'next/link';
import { money, useApi } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { ShopLayout, type Shopper } from '@/components/shop-chrome';
import { Button, Card, EmptyState, ErrorNote, Loading, Pill } from '@/components/ui';

export default function CartPage() {
  const cart = useCart();
  const me = useApi<Shopper>('auth/me');
  const q = cart.quote;

  const towardFreeShipping = q
    ? Math.max(0, q.freeShippingThresholdCents - q.subtotalCents)
    : 0;

  return (
    <ShopLayout>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-ink-900">
          My cart{cart.count > 0 && ` · ${cart.count} item${cart.count === 1 ? '' : 's'}`}
        </h1>

        {cart.error && <ErrorNote message={cart.error} onRetry={cart.refresh} />}

        {cart.lines.length === 0 ? (
          <Card>
            <EmptyState title="Your cart is empty" body="Browse the catalog to get started." />
            <div className="pb-6 text-center">
              <Link href="/products">
                <Button>Shop products</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-3">
              {cart.loading && !q && <Loading label="Pricing your cart" />}

              {q?.items.map((item) => (
                <Card key={item.skuId} padded={false}>
                  <div className="flex gap-4 p-4">
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-ink-100 text-2xs text-ink-400">
                      {item.type === 'WHEEL' ? 'Wheel' : 'Tire'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-2xs text-ink-500">{item.brand}</p>
                      <p className="text-sm font-medium text-ink-900">{item.name}</p>
                      <p className="mt-0.5 font-mono text-2xs text-ink-500">{item.sku}</p>

                      {/* Says plainly why this price differs from the list price. */}
                      {item.unitPriceCents < item.listPriceCents && (
                        <div className="mt-1.5">
                          <Pill tone="success">
                            {item.reason.startsWith('group') ? 'Your group price' : 'Discounted'} ·
                            save {money(item.listPriceCents - item.unitPriceCents)} each
                          </Pill>
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex items-center rounded-lg border border-ink-300">
                          <button
                            onClick={() => cart.setQuantity(item.skuId, item.quantity - 1)}
                            className="px-2.5 py-1 text-ink-600 hover:text-ink-900"
                            aria-label={`Decrease ${item.name}`}
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-xs font-medium">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => cart.setQuantity(item.skuId, item.quantity + 1)}
                            className="px-2.5 py-1 text-ink-600 hover:text-ink-900"
                            aria-label={`Increase ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => cart.remove(item.skuId)}
                          className="text-xs font-medium text-ink-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-900">
                        {money(item.lineTotalCents)}
                      </p>
                      {item.unitPriceCents < item.listPriceCents && (
                        <p className="text-2xs text-ink-400 line-through">
                          {money(item.listPriceCents * item.quantity)}
                        </p>
                      )}
                      <p className="mt-0.5 text-2xs text-ink-500">
                        {money(item.unitPriceCents)} each
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Bill summary */}
            <div className="space-y-4">
              {q && towardFreeShipping > 0 && (
                <Card>
                  <p className="text-xs text-ink-700">
                    Add {money(towardFreeShipping)} more for free delivery
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{
                        width: `${Math.min(100, (q.subtotalCents / q.freeShippingThresholdCents) * 100)}%`,
                      }}
                    />
                  </div>
                </Card>
              )}

              <Card>
                <h2 className="text-sm font-semibold text-ink-900">Bill summary</h2>

                {!me.data?.id && (
                  <p className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-2xs text-ink-600">
                    Sign in at checkout — trade and fleet pricing is applied to your cart
                    automatically.
                  </p>
                )}

                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Subtotal" value={money(q?.subtotalCents ?? 0)} />
                  {q && q.discountCents > 0 && (
                    <Row label="Your savings" value={`− ${money(q.discountCents)}`} good />
                  )}
                  <Row
                    label="Delivery"
                    value={q?.shippingCents === 0 ? 'FREE' : money(q?.shippingCents ?? 0)}
                  />
                  <Row label="Tax" value={money(q?.taxCents ?? 0)} />
                  <div className="flex justify-between border-t border-ink-200 pt-2.5 text-base font-semibold text-ink-900">
                    <dt>Total</dt>
                    <dd>{money(q?.totalCents ?? 0)}</dd>
                  </div>
                </dl>

                <Link href="/checkout">
                  <Button className="mt-4 w-full" disabled={!q || cart.loading}>
                    Proceed to checkout
                  </Button>
                </Link>

                <Link href="/products">
                  <Button variant="ghost" className="mt-2 w-full">
                    Continue shopping
                  </Button>
                </Link>
              </Card>
            </div>
          </div>
        )}
      </div>
    </ShopLayout>
  );
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className={`flex justify-between ${good ? 'text-brand-600' : 'text-ink-600'}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
