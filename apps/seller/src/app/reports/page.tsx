'use client';

import { useState } from 'react';
import { money, moneyCompact, number, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import {
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusPill,
  Table,
  Td,
  Th,
} from '@/components/ui';

interface Reports {
  windowDays: number;
  totals: {
    orders: number;
    revenueCents: number;
    taxCents: number;
    shippingCents: number;
    discountCents: number;
    averageOrderCents: number;
    customers: number;
  };
  byStatus: { status: string; count: number; revenueCents: number }[];
  topProducts: { sku: string; name: string; brand: string; units: number; revenueCents: number }[];
}

const RANGES = [7, 30, 90, 365] as const;

export default function ReportsPage() {
  const ready = useRequireSeller();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error, loading, reload } = useApi<Reports>(
    ready ? `dashboard/reports?days=${days}` : null,
  );

  return (
    <Shell breadcrumb={['Reports']}>
      <PageHeader
        title="Reports"
        subtitle="Sales performance for your store"
        action={
          <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  days === r ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {r === 365 ? '1 year' : `${r}d`}
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Revenue" value={moneyCompact(data.totals.revenueCents)} />
            <StatCard label="Paid orders" value={number(data.totals.orders)} />
            <StatCard label="Average order" value={money(data.totals.averageOrderCents)} />
            <StatCard label="Customers" value={number(data.totals.customers)} hint="All time" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card padded={false}>
              <SectionHeader title="Orders by status" subtitle={`Last ${data.windowDays} days`} />
              {data.byStatus.length === 0 ? (
                <EmptyState title="No orders in this window" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Status</Th>
                      <Th>Orders</Th>
                      <Th>Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byStatus.map((s) => (
                      <tr key={s.status} className="hover:bg-ink-50">
                        <Td>
                          <StatusPill status={s.status} />
                        </Td>
                        <Td>{number(s.count)}</Td>
                        <Td className="font-medium text-ink-900">{money(s.revenueCents)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink-900">Revenue breakdown</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <Line label="Gross revenue" cents={data.totals.revenueCents} />
                <Line label="of which tax" cents={data.totals.taxCents} muted />
                <Line label="of which shipping" cents={data.totals.shippingCents} muted />
                <Line label="Discounts given" cents={-data.totals.discountCents} muted />
                <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold text-ink-900">
                  <dt>Net of tax &amp; shipping</dt>
                  <dd>
                    {money(
                      data.totals.revenueCents - data.totals.taxCents - data.totals.shippingCents,
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card padded={false}>
            <SectionHeader title="Top products" subtitle="By revenue in this window" />
            {data.topProducts.length === 0 ? (
              <EmptyState title="Nothing sold yet in this window" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>SKU</Th>
                    <Th>Brand</Th>
                    <Th>Units</Th>
                    <Th>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.sku} className="hover:bg-ink-50">
                      <Td className="font-medium text-ink-900">{p.name}</Td>
                      <Td>
                        <code className="font-mono text-2xs text-ink-600">{p.sku}</code>
                      </Td>
                      <Td>{p.brand}</Td>
                      <Td>{number(p.units)}</Td>
                      <Td className="font-medium text-ink-900">{money(p.revenueCents)}</Td>
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

function Line({ label, cents, muted }: { label: string; cents: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-ink-500' : 'text-ink-800'}`}>
      <dt className={muted ? 'pl-3 text-xs' : ''}>{label}</dt>
      <dd className={muted ? 'text-xs' : ''}>{money(cents)}</dd>
    </div>
  );
}
