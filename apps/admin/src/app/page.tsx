'use client';

import Link from 'next/link';
import { moneyCompact, money, number, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  LineChart,
  Card,
  DonutChart,
  ErrorNote,
  Loading,
  PageHeader,
  SectionHeader,
  StatCard,
  Table,
  Td,
  Th,
} from '@/components/ui';

interface Dashboard {
  windowDays: number;
  gmv: { cents: number; deltaPct: number | null };
  orders: { count: number; deltaPct: number | null };
  tenants: { active: number; total: number; pending: number; newThisMonth: number };
  skus: { total: number };
  gmvTrend: { date: string; cents: number }[];
  ordersByStatus: { status: string; count: number }[];
  topStores: { slug: string; name: string; orders30d: number; revenueCents: number; skus: number }[];
  degradedTenants: string[];
}

// Status colours match the semantic ramp in the design system.
const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#1F6B46',
  SHIPPED: '#2563EB',
  PAID: '#84CC16',
  FULFILLING: '#F59E0B',
  AWAITING_PAYMENT: '#CBD2C8',
  CANCELLED: '#DC2626',
  REFUNDED: '#9AA397',
  DRAFT: '#E2E6E0',
};

export default function DashboardPage() {
  const ready = useRequireAuth();
  const { data, error, loading, reload } = useApi<Dashboard>(ready ? 'metrics/dashboard' : null);

  return (
    <Shell breadcrumb={['Dashboard']}>
      <PageHeader title="Dashboard" subtitle={`Marketplace overview · last ${data?.windowDays ?? 30} days`} />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {(loading || !ready) && !data && <Loading label="Aggregating across tenant databases" />}

      {data && (
        <div className="space-y-5">
          {data.degradedTenants.length > 0 && (
            <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Could not read {data.degradedTenants.join(', ')} — those stores are excluded from
              these totals.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="GMV" value={moneyCompact(data.gmv.cents)} delta={data.gmv.deltaPct} />
            <StatCard label="Total orders" value={number(data.orders.count)} delta={data.orders.deltaPct} />
            <StatCard
              label="Active stores"
              value={number(data.tenants.active)}
              hint={`${data.tenants.newThisMonth} new this month · ${data.tenants.total} total`}
            />
            <StatCard
              label="Live SKUs"
              value={number(data.skus.total)}
              hint="Across every active store"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2" padded={false}>
              <SectionHeader title="GMV trend" subtitle="Last 30 days, in 3-day periods" />
              <div className="p-5">
                <LineChart points={data.gmvTrend} />
              </div>
            </Card>

            <Card padded={false}>
              <SectionHeader title="Orders by status" />
              <div className="p-5">
                <DonutChart
                  slices={data.ordersByStatus.map((s) => ({
                    label: s.status,
                    value: s.count,
                    color: STATUS_COLORS[s.status] ?? '#9AA397',
                  }))}
                />
              </div>
            </Card>
          </div>

          <Card padded={false}>
            <SectionHeader
              title="Top stores"
              action={
                <Link href="/stores" className="text-xs font-medium text-brand-600 hover:underline">
                  View all
                </Link>
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th>Orders (30d)</Th>
                  <Th>Revenue</Th>
                  <Th>SKUs</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.topStores.map((s) => (
                  <tr key={s.slug} className="hover:bg-ink-50">
                    <Td className="font-medium text-ink-900">{s.name}</Td>
                    <Td>{number(s.orders30d)}</Td>
                    <Td>{money(s.revenueCents)}</Td>
                    <Td>{number(s.skus)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/stores/${s.slug}`}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        Open
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </Shell>
  );
}
