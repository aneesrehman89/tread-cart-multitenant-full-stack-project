'use client';

import { useState } from 'react';
import { api, number, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import { EditableText } from '@/components/editable';
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

interface Customer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  groupId: string | null;
  group: { id: string; name: string } | null;
  createdAt: string;
  _count: { orders: number };
}

interface Group {
  id: string;
  name: string;
  code: string;
}

export default function CustomersPage() {
  const ready = useRequireSeller();
  const [search, setSearch] = useState('');

  const customers = useApi<{ customers: Customer[] }>(
    ready ? `customers${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}` : null,
  );
  const groups = useApi<{ groups: Group[] }>(ready ? 'customers/groups' : null);

  async function setGroup(customerId: string, groupId: string) {
    await api(`customers/${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ groupId: groupId || null }),
    });
    customers.reload();
  }

  /** Splits a typed full name back into the two stored fields. */
  async function setName(customerId: string, full: string) {
    const [firstName, ...rest] = full.trim().split(/\s+/);
    await api(`customers/${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ firstName: firstName ?? null, lastName: rest.join(' ') || null }),
    });
    customers.reload();
  }

  const rows = customers.data?.customers ?? [];

  return (
    <Shell breadcrumb={['Customers']}>
      <PageHeader
        title="Customers"
        subtitle="Everyone who has bought from you, and the pricing group they fall into"
      />

      {customers.error && <ErrorNote message={customers.error} onRetry={customers.reload} />}

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

        {customers.loading && !customers.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState title="No customers yet" body="They appear here after their first order." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Orders</Th>
                <Th>Pricing group</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50">
                  <Td className="font-medium text-ink-900">
                    <EditableText
                      value={[c.firstName, c.lastName].filter(Boolean).join(' ')}
                      placeholder="Add a name"
                      onSave={(name) => setName(c.id, name)}
                    />
                  </Td>
                  <Td>{c.email}</Td>
                  <Td>{number(c._count.orders)}</Td>
                  <Td>
                    {/* Changing the group changes what this customer pays. */}
                    <select
                      value={c.groupId ?? ''}
                      onChange={(e) => setGroup(c.id, e.target.value)}
                      className="rounded-lg border border-ink-300 bg-surface px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">No group</option>
                      {(groups.data?.groups ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td className="text-ink-500">{relativeTime(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-2xs text-ink-500">
        Group pricing is configured under{' '}
        <Pill tone="neutral">Pricing groups</Pill>.
      </p>
    </Shell>
  );
}
