'use client';

import Link from 'next/link';
import { useState } from 'react';
import { money, number, relativeTime, useApi } from '@/lib/api';
import { ShopLayout } from '@/components/shop-chrome';
import { Button, Card, EmptyState, ErrorNote, Loading, StatusPill } from '@/components/ui';

interface OrderRow {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  createdAt: string;
  items: { quantity: number }[];
}

const TABS = ['Active', 'Past'] as const;

export default function OrdersPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Active');
  const { data, error, loading, reload } = useApi<{ active: OrderRow[]; past: OrderRow[] }>('orders');

  const rows = data ? (tab === 'Active' ? data.active : data.past) : [];

  return (
    <ShopLayout>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-ink-900">My orders</h1>

        <div className="mb-5 flex gap-1 border-b border-ink-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
                tab === t
                  ? 'border-brand-600 font-medium text-brand-700'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              {t}
              {data && (
                <span className="ml-1.5 text-ink-400">
                  {t === 'Active' ? data.active.length : data.past.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}

        {data && rows.length === 0 && (
          <Card>
            <EmptyState
              title={tab === 'Active' ? 'No orders in progress' : 'No past orders'}
              body="Orders you place appear here."
            />
          </Card>
        )}

        <div className="space-y-3">
          {rows.map((o) => (
            <Card key={o.id} padded={false}>
              <div className="flex flex-wrap items-center gap-4 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-ink-100 text-2xs text-ink-400">
                  {o.items.reduce((a, i) => a + i.quantity, 0)}×
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium text-ink-900">{o.number}</span>
                    <StatusPill status={o.status} />
                  </div>
                  <p className="mt-1 text-2xs text-ink-500">
                    {number(o.items.reduce((a, i) => a + i.quantity, 0))} items ·{' '}
                    {money(o.totalCents)} · {relativeTime(o.createdAt)}
                  </p>
                </div>
                <Link href={`/orders/${o.id}`}>
                  <Button variant="secondary" size="sm">
                    View details
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </ShopLayout>
  );
}
