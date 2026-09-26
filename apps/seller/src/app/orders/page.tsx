'use client';

import Link from 'next/link';
import { useState } from 'react';
import { money, number, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import {
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  Pill,
  StatusPill,
  Table,
  Td,
  Th,
  inputClass,
  titleCase,
} from '@/components/ui';

interface Order {
  id: string;
  number: string;
  status: string;
  email: string;
  totalCents: number;
  createdAt: string;
  items: { quantity: number }[];
  customer: { firstName: string | null; lastName: string | null; group: { name: string } | null } | null;
}

const STATUSES = ['All', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] as const;

export default function OrdersPage() {
  const ready = useRequireSeller();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');
  const [search, setSearch] = useState('');

  const query = new URLSearchParams();
  if (status !== 'All') query.set('status', status);
  if (search.trim()) query.set('q', search.trim());

  const { data, error, loading, reload } = useApi<{
    orders: Order[];
    countsByStatus: Record<string, number>;
  }>(ready ? `orders?${query.toString()}` : null);

  const orders = data?.orders ?? [];

  return (
    <Shell breadcrumb={['Orders']}>
      <PageHeader title="Orders" subtitle="Everything customers have bought from your store" />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => {
              const count = s === 'All' ? undefined : data?.countsByStatus[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    status === s ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-100'
                  }`}
                >
                  {s === 'All' ? 'All' : titleCase(s)}
                  {count != null && <span className="ml-1 text-ink-400">{count}</span>}
                </button>
              );
            })}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or email…"
            className={`${inputClass} ml-auto max-w-xs`}
          />
        </div>

        {loading && !data ? (
          <Loading />
        ) : orders.length === 0 ? (
          <EmptyState title="No orders match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Group</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-ink-50">
                  <Td>
                    <code className="font-mono text-2xs text-ink-700">{o.number}</code>
                  </Td>
                  <Td>
                    <p className="text-ink-900">
                      {[o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ') ||
                        '—'}
                    </p>
                    <p className="text-2xs text-ink-500">{o.email}</p>
                  </Td>
                  <Td>
                    {o.customer?.group ? (
                      <Pill tone="info">{o.customer.group.name}</Pill>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </Td>
                  <Td>{number(o.items.reduce((a, i) => a + i.quantity, 0))}</Td>
                  <Td className="font-medium text-ink-900">{money(o.totalCents)}</Td>
                  <Td className="text-ink-500">{relativeTime(o.createdAt)}</Td>
                  <Td>
                    <StatusPill status={o.status} />
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/orders/${o.id}`}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Open
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Shell>
  );
}
