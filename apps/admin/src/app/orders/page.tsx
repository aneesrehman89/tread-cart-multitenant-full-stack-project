'use client';

import { useMemo, useState } from 'react';
import { money, number, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
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

interface GlobalOrder {
  id: string;
  number: string;
  status: string;
  email: string;
  totalCents: number;
  itemCount: number;
  createdAt: string;
  store: { slug: string; name: string };
}

const STATUSES = ['All', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;

export default function OrdersPage() {
  const ready = useRequireAuth();
  const { data, error, loading, reload } = useApi<{ orders: GlobalOrder[] }>(
    ready ? 'global/orders' : null,
  );
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.orders ?? []).filter(
      (o) =>
        (status === 'All' || o.status === status) &&
        (!q || o.number.toLowerCase().includes(q) || o.email.toLowerCase().includes(q)),
    );
  }, [data, status, search]);

  const totalCents = rows.reduce((a, o) => a + o.totalCents, 0);

  return (
    <Shell breadcrumb={['Orders']}>
      <PageHeader
        title="Orders"
        subtitle="The most recent orders from every store on the platform"
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  status === s ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {s === 'All' ? 'All' : titleCase(s)}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order or email…"
            className={`${inputClass} ml-auto max-w-xs`}
          />
          <span className="text-2xs text-ink-500">
            {number(rows.length)} orders · {money(totalCents)}
          </span>
        </div>

        {loading && !data ? (
          <Loading label="Reading orders from every tenant" />
        ) : rows.length === 0 ? (
          <EmptyState title="No orders match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Store</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={`${o.store.slug}-${o.id}`} className="hover:bg-ink-50">
                  <Td>
                    <code className="font-mono text-2xs text-ink-700">{o.number}</code>
                  </Td>
                  <Td>
                    <Pill tone="neutral">{o.store.name}</Pill>
                  </Td>
                  <Td>{o.email}</Td>
                  <Td>{o.itemCount}</Td>
                  <Td className="font-medium text-ink-900">{money(o.totalCents)}</Td>
                  <Td className="text-ink-500">{relativeTime(o.createdAt)}</Td>
                  <Td>
                    <StatusPill status={o.status} />
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
