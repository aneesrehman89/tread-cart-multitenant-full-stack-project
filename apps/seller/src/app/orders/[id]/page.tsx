'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { api, money, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import {
  Button,
  Card,
  ErrorNote,
  Loading,
  Pill,
  StatusPill,
  Table,
  Td,
  Th,
  inputClass,
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
    sku: { sku: string; product: { name: string; type: string } };
  }[];
  customer: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    group: { name: string } | null;
    addresses: {
      id: string;
      line1: string;
      line2: string | null;
      city: string;
      region: string;
      postalCode: string;
      country: string;
    }[];
  } | null;
  events: { id: string; status: string; note: string | null; createdAt: string }[];
}

/** Mirrors the transition table the API enforces, so the UI offers only legal moves. */
const NEXT_STEPS: Record<string, { status: string; label: string; variant?: 'danger' }[]> = {
  PAID: [
    { status: 'FULFILLING', label: 'Start fulfilment' },
    { status: 'CANCELLED', label: 'Cancel order', variant: 'danger' },
  ],
  FULFILLING: [
    { status: 'SHIPPED', label: 'Mark shipped' },
    { status: 'CANCELLED', label: 'Cancel order', variant: 'danger' },
  ],
  SHIPPED: [{ status: 'DELIVERED', label: 'Mark delivered' }],
  DELIVERED: [{ status: 'REFUNDED', label: 'Refund', variant: 'danger' }],
  AWAITING_PAYMENT: [
    { status: 'PAID', label: 'Mark paid' },
    { status: 'CANCELLED', label: 'Cancel order', variant: 'danger' },
  ],
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ready = useRequireSeller();
  const { data, error, loading, reload } = useApi<OrderDetail>(ready ? `orders/${id}` : null);

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function move(status: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`orders/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, note: note.trim() || undefined }),
      });
      setNote('');
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the order');
    } finally {
      setBusy(false);
    }
  }

  const steps = data ? (NEXT_STEPS[data.status] ?? []) : [];

  return (
    <Shell breadcrumb={['Orders', data?.number ?? id]}>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
                  {data.number}
                </h1>
                <StatusPill status={data.status} />
              </div>
              <p className="mt-1 text-sm text-ink-500">
                Placed {relativeTime(data.createdAt)}
                {data.paidAt && ` · paid ${relativeTime(data.paidAt)}`}
              </p>
            </div>
            <Link href="/orders" className="text-xs font-medium text-brand-600 hover:underline">
              ← All orders
            </Link>
          </div>

          {actionError && <ErrorNote message={actionError} />}

          <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-5">
              <Card padded={false}>
                <div className="border-b border-ink-200 px-5 py-4">
                  <h2 className="text-sm font-semibold text-ink-900">Items</h2>
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th>SKU</Th>
                      <Th>Qty</Th>
                      <Th>Unit</Th>
                      <Th>Line total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((i) => {
                      const discounted = i.unitPriceCents < i.listPriceCents;
                      return (
                        <tr key={i.id}>
                          <Td className="font-medium text-ink-900">{i.nameSnapshot}</Td>
                          <Td>
                            <code className="font-mono text-2xs text-ink-600">{i.sku.sku}</code>
                          </Td>
                          <Td>{i.quantity}</Td>
                          <Td>
                            {money(i.unitPriceCents)}
                            {discounted && (
                              <span className="ml-1.5 text-2xs text-ink-400 line-through">
                                {money(i.listPriceCents)}
                              </span>
                            )}
                          </Td>
                          <Td className="font-medium text-ink-900">
                            {money(i.unitPriceCents * i.quantity)}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>

                <dl className="space-y-1.5 border-t border-ink-200 px-5 py-4 text-sm">
                  <Money label="Subtotal" cents={data.subtotalCents} />
                  {data.discountCents > 0 && (
                    <Money label="Discount" cents={-data.discountCents} />
                  )}
                  <Money label="Tax" cents={data.taxCents} />
                  <Money label="Shipping" cents={data.shippingCents} />
                  <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-semibold text-ink-900">
                    <dt>Total</dt>
                    <dd>{money(data.totalCents)}</dd>
                  </div>
                </dl>
              </Card>

              <Card>
                <h2 className="text-sm font-semibold text-ink-900">Fulfilment</h2>
                {steps.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-500">
                    This order is {titleCase(data.status).toLowerCase()} — no further steps.
                  </p>
                ) : (
                  <>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note for the order history (tracking number, reason…)"
                      className={`${inputClass} mt-3`}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {steps.map((s) => (
                        <Button
                          key={s.status}
                          variant={s.variant === 'danger' ? 'danger' : 'primary'}
                          disabled={busy}
                          onClick={() => move(s.status)}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <h2 className="text-sm font-semibold text-ink-900">Customer</h2>
                <p className="mt-2 text-sm text-ink-900">
                  {[data.customer?.firstName, data.customer?.lastName].filter(Boolean).join(' ') ||
                    '—'}
                </p>
                <p className="text-xs text-ink-500">{data.email}</p>
                {data.customer?.phone && (
                  <p className="text-xs text-ink-500">{data.customer.phone}</p>
                )}
                {data.customer?.group && (
                  <div className="mt-2">
                    <Pill tone="info">{data.customer.group.name} pricing</Pill>
                  </div>
                )}

                {data.customer?.addresses[0] && (
                  <div className="mt-4 border-t border-ink-200 pt-3">
                    <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                      Shipping address
                    </p>
                    <address className="mt-1 text-xs not-italic leading-relaxed text-ink-700">
                      {data.customer.addresses[0].line1}
                      <br />
                      {data.customer.addresses[0].city}, {data.customer.addresses[0].region}{' '}
                      {data.customer.addresses[0].postalCode}
                      <br />
                      {data.customer.addresses[0].country}
                    </address>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="text-sm font-semibold text-ink-900">History</h2>
                {data.events.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-500">
                    No status changes recorded since this order was created.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {data.events.map((e) => (
                      <li key={e.id} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                        <div>
                          <p className="text-xs font-medium text-ink-900">
                            {titleCase(e.status)}
                          </p>
                          {e.note && <p className="text-2xs text-ink-600">{e.note}</p>}
                          <p className="text-2xs text-ink-400">{relativeTime(e.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function Money({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between text-ink-600">
      <dt>{label}</dt>
      <dd>{money(cents)}</dd>
    </div>
  );
}
