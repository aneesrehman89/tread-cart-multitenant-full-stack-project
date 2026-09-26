'use client';

import { useMemo, useState } from 'react';
import { number, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  Pill,
  Table,
  Td,
  Th,
  inputClass,
} from '@/components/ui';

interface GlobalCustomer {
  id: string;
  email: string;
  name: string | null;
  group: { name: string; code: string } | null;
  orderCount: number;
  createdAt: string;
  store: { slug: string; name: string };
}

export default function CustomersPage() {
  const ready = useRequireAuth();
  const { data, error, loading, reload } = useApi<{ customers: GlobalCustomer[] }>(
    ready ? 'global/customers' : null,
  );
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.customers ?? []).filter(
      (c) => !q || c.email.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <Shell breadcrumb={['Customers']}>
      <PageHeader
        title="Customers"
        subtitle="Customers across every store, with the pricing group each one belongs to"
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className={`${inputClass} max-w-xs`}
          />
          <span className="ml-auto text-2xs text-ink-500">{number(rows.length)} customers</span>
        </div>

        {loading && !data ? (
          <Loading label="Reading customers from every tenant" />
        ) : rows.length === 0 ? (
          <EmptyState title="No customers match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Store</Th>
                <Th>Pricing group</Th>
                <Th>Orders</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={`${c.store.slug}-${c.id}`} className="hover:bg-ink-50">
                  <Td className="font-medium text-ink-900">{c.name ?? '—'}</Td>
                  <Td>{c.email}</Td>
                  <Td>
                    <Pill tone="neutral">{c.store.name}</Pill>
                  </Td>
                  <Td>
                    {c.group ? (
                      <Pill tone="info">{c.group.name}</Pill>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </Td>
                  <Td>{number(c.orderCount)}</Td>
                  <Td className="text-ink-500">{relativeTime(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Shell>
  );
}
