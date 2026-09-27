'use client';

import Link from 'next/link';
import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { money, relativeTime, useApi } from '@/lib/api';
import { ShopLayout } from '@/components/shop-chrome';
import {
  Button,
  Card,
  ErrorNote,
  Loading,
  StatusPill,
  Table,
  Td,
  Th,
  titleCase,
} from '@/components/ui';

interface OrderDetail {
  id: string;
  number: string;
  status: string;
  email: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  items: {
    id: string;
    quantity: number;
    unitPriceCents: number;
    listPriceCents: number;
    nameSnapshot: string;
    sku: { sku: string; product: { name: string; slug: string; type: string } };
  }[];
  events: { id: string; status: string; note: string | null; createdAt: string }[];
}

/** Progress a shopper actually cares about, in the order it happens. */
const JOURNEY = ['PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED'] as const;
const JOURNEY_LABEL: Record<string, string> = {
  PAID: 'Order confirmed',
  FULFILLING: 'Being packed',
  SHIPPED: 'On its way',
  DELIVERED: 'Delivered',
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const justPaid = search.get('paid') === '1';

  const { data, error, loading, reload } = useApi<OrderDetail>(`orders/${id}`);

  const stage = data ? JOURNEY.indexOf(data.status as (typeof JOURNEY)[number]) : -1;
  const cancelled = data?.status === 'CANCELLED' || data?.status === 'REFUNDED';

  return (
    <ShopLayout>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}

        {data && (
          <>
            {justPaid && (
              <Card className="mb-5 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-2xl text-brand-700">
                  ✓
                </span>
                <h1 className="mt-4 text-xl font-semibold text-ink-900">Order placed!</h1>
                <p className="mt-1.5 text-xs text-ink-500">
                  Order <strong className="text-ink-800">{data.number}</strong> — confirmation sent
                  to {data.email}
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Link href="/orders">
                    <Button>Track order</Button>
                  </Link>
                  <Link href="/products">
                    <Button variant="secondary">Continue shopping</Button>
                  </Link>
                </div>
              </Card>
            )}

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="font-mono text-lg font-semibold text-ink-900">{data.number}</h1>
                  <StatusPill status={data.status} />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Placed {relativeTime(data.createdAt)}
                  {data.paidAt && ` · paid ${relativeTime(data.paidAt)}`}
                </p>
              </div>
              <Link href="/orders" className="text-xs font-medium text-brand-600 hover:underline">
                ← All orders
              </Link>
            </div>

            {/* Delivery progress */}
            {!cancelled && stage >= 0 && (
              <Card className="mb-5">
                <ol className="flex items-center">
                  {JOURNEY.map((s, i) => (
                    <li key={s} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className={`grid h-7 w-7 place-items-center rounded-full text-2xs font-semibold ${
                            i <= stage ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-400'
                          }`}
                        >
                          {i <= stage ? '✓' : i + 1}
                        </span>
                        <span
                          className={`whitespace-nowrap text-2xs ${
                            i <= stage ? 'font-medium text-ink-800' : 'text-ink-400'
                          }`}
                        >
                          {JOURNEY_LABEL[s]}
                        </span>
                      </div>
                      {i < JOURNEY.length - 1 && (
                        <span
                          className={`mx-2 -mt-5 h-0.5 flex-1 ${
                            i < stage ? 'bg-brand-700' : 'bg-ink-200'
                          }`}
                        />
                      )}
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {cancelled && (
              <div className="mb-5 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                This order was {data.status.toLowerCase()}.
              </div>
            )}

            <Card padded={false}>
              <div className="border-b border-ink-200 px-5 py-4">
                <h2 className="text-sm font-semibold text-ink-900">Items</h2>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Qty</Th>
                    <Th>Unit</Th>
                    <Th>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.id}>
                      <Td>
                        <Link
                          href={`/products/${i.sku.product.slug}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {i.nameSnapshot}
                        </Link>
                        <p className="font-mono text-2xs text-ink-500">{i.sku.sku}</p>
                      </Td>
                      <Td>{i.quantity}</Td>
                      <Td>
                        {money(i.unitPriceCents)}
                        {i.unitPriceCents < i.listPriceCents && (
                          <span className="ml-1.5 text-2xs text-ink-400 line-through">
                            {money(i.listPriceCents)}
                          </span>
                        )}
                      </Td>
                      <Td className="font-medium text-ink-900">
                        {money(i.unitPriceCents * i.quantity)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <dl className="space-y-1.5 border-t border-ink-200 px-5 py-4 text-sm">
                <Line label="Subtotal" cents={data.subtotalCents} />
                {data.discountCents > 0 && (
                  <Line label="Savings" cents={-data.discountCents} good />
                )}
                <Line label="Delivery" cents={data.shippingCents} />
                <Line label="Tax" cents={data.taxCents} />
                <div className="flex justify-between border-t border-ink-200 pt-2.5 text-base font-semibold text-ink-900">
                  <dt>Total</dt>
                  <dd>{money(data.totalCents)}</dd>
                </div>
              </dl>
            </Card>

            {data.events.length > 0 && (
              <Card className="mt-5">
                <h2 className="text-sm font-semibold text-ink-900">History</h2>
                <ol className="mt-3 space-y-3">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      <div>
                        <p className="text-xs font-medium text-ink-900">{titleCase(e.status)}</p>
                        {e.note && <p className="text-2xs text-ink-600">{e.note}</p>}
                        <p className="text-2xs text-ink-400">{relativeTime(e.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </>
        )}
      </div>
    </ShopLayout>
  );
}

function Line({ label, cents, good }: { label: string; cents: number; good?: boolean }) {
  return (
    <div className={`flex justify-between ${good ? 'text-brand-600' : 'text-ink-600'}`}>
      <dt>{label}</dt>
      <dd>{cents === 0 && label === 'Delivery' ? 'FREE' : money(cents)}</dd>
    </div>
  );
}
