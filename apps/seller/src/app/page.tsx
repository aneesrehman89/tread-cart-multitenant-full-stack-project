'use client';

import Link from 'next/link';
import { useState } from 'react';
import { money, moneyCompact, number, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller, type SellerMe } from '@/components/shell';
import {
  Card,
  EmptyState,
  ErrorNote,
  LineChart,
  Loading,
  Pill,
  SectionHeader,
  StatCard,
  StatusPill,
  Table,
  Td,
  Th,
} from '@/components/ui';

interface Dashboard {
  windowDays: number;
  ordersToday: number;
  revenue: { cents: number; deltaPct: number | null };
  orders: { count: number; deltaPct: number | null };
  pendingFulfilment: number;
  lowStockCount: number;
  lowStock: { skuId: string; sku: string; name: string; onHand: number; reorderAt: number }[];
  salesTrend: { date: string; cents: number }[];
  ordersToFulfil: {
    id: string;
    number: string;
    status: string;
    email: string;
    totalCents: number;
    itemCount: number;
    createdAt: string;
  }[];
}

const RANGES = [7, 30, 90] as const;

export default function SellerDashboard() {
  const ready = useRequireSeller();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const me = useApi<SellerMe>(ready ? 'auth/me' : null);
  const { data, error, loading, reload } = useApi<Dashboard>(
    ready ? `dashboard?days=${days}` : null,
  );

  const firstName = me.data?.name.split(' ')[0] ?? '';

  return (
    <Shell breadcrumb={['Dashboard']}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {greeting()}
            {firstName && `, ${firstName}`}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Here&apos;s how {me.data?.store.name ?? 'your store'} is doing.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                days === r ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Orders today" value={number(data.ordersToday)} />
            <StatCard
              label={`Revenue (${data.windowDays}d)`}
              value={moneyCompact(data.revenue.cents)}
              delta={data.revenue.deltaPct}
            />
            <StatCard
              label="Pending fulfilment"
              value={number(data.pendingFulfilment)}
              hint={data.pendingFulfilment > 0 ? 'Needs action' : 'All caught up'}
            />
            <StatCard
              label="Low stock alerts"
              value={number(data.lowStockCount)}
              hint={data.lowStockCount > 0 ? 'At or below reorder point' : 'Stock is healthy'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2" padded={false}>
              <SectionHeader title="Sales" subtitle={`Last ${Math.min(data.windowDays, 14)} days`} />
              <div className="p-5">
                <LineChart points={data.salesTrend} />
              </div>
            </Card>

            <Card padded={false}>
              <SectionHeader
                title="Low stock alerts"
                action={
                  <Link href="/products?stock=LOW" className="text-xs font-medium text-brand-600 hover:underline">
                    View all
                  </Link>
                }
              />
              {data.lowStock.length === 0 ? (
                <EmptyState title="Nothing running low" />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.lowStock.map((s) => (
                    <li key={s.skuId} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink-900">{s.name}</p>
                        <p className="font-mono text-2xs text-ink-500">{s.sku}</p>
                      </div>
                      <Pill tone={s.onHand === 0 ? 'danger' : 'warning'}>
                        {s.onHand === 0 ? 'Out' : `${s.onHand} left`}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card padded={false}>
            <SectionHeader
              title="Orders to fulfil"
              subtitle="Paid and in progress"
              action={
                <Link href="/orders" className="text-xs font-medium text-brand-600 hover:underline">
                  All orders
                </Link>
              }
            />
            {data.ordersToFulfil.length === 0 ? (
              <EmptyState title="No orders waiting" body="Everything paid has been shipped." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Items</Th>
                    <Th>Total</Th>
                    <Th>Placed</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.ordersToFulfil.map((o) => (
                    <tr key={o.id} className="hover:bg-ink-50">
                      <Td>
                        <code className="font-mono text-2xs text-ink-700">{o.number}</code>
                      </Td>
                      <Td>{o.email}</Td>
                      <Td>{o.itemCount}</Td>
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
        </div>
      )}
    </Shell>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
