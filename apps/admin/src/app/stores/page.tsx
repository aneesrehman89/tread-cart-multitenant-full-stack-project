'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, initials, money, number, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Avatar,
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  StatusPill,
  Table,
  Td,
  Th,
  inputClass,
} from '@/components/ui';

interface StoreRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  brandPrimary: string;
  primaryHost: string | null;
  databaseName: string;
  staffCount: number;
  orders30d: number;
  revenueCents: number;
  skuCount: number;
  statsError: string | null;
}

const FILTERS = ['All', 'Active', 'Pending', 'Suspended'] as const;

export default function StoresPage() {
  const ready = useRequireAuth();
  const { data, error, loading, reload } = useApi<{ tenants: StoreRow[] }>(ready ? 'tenants' : null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [search, setSearch] = useState('');
  const [onboarding, setOnboarding] = useState(false);

  const rows = useMemo(() => {
    const all = data?.tenants ?? [];
    return all.filter((t) => {
      const matchesFilter = filter === 'All' || t.status.toLowerCase() === filter.toLowerCase();
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.slug.includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, search]);

  return (
    <Shell breadcrumb={['Stores']}>
      <PageHeader
        title="Stores"
        subtitle="Every tenant on the platform, each with its own isolated database"
        action={<Button onClick={() => setOnboarding(true)}>+ Onboard store</Button>}
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-3">
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === f ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores…"
            className={`${inputClass} ml-auto max-w-xs`}
          />
        </div>

        {loading && !data ? (
          <Loading />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>Database</Th>
                <Th>Orders (30d)</Th>
                <Th>Revenue</Th>
                <Th>SKUs</Th>
                <Th>Staff</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-ink-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar label={initials(t.name)} color={t.brandPrimary} size="sm" />
                      <div>
                        <p className="font-medium text-ink-900">{t.name}</p>
                        <p className="text-2xs text-ink-500">{t.primaryHost ?? t.slug}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-600">
                      {t.databaseName}
                    </code>
                  </Td>
                  {/* Only active stores are queried, so a suspended store has
                      no figures rather than genuinely zero ones. */}
                  {t.status !== 'ACTIVE' || t.statsError ? (
                    <>
                      <Td className="text-2xs text-ink-400" >
                        {t.statsError ? 'unreachable' : 'not queried'}
                      </Td>
                      <Td className="text-ink-400">—</Td>
                      <Td className="text-ink-400">—</Td>
                    </>
                  ) : (
                    <>
                      <Td>{number(t.orders30d)}</Td>
                      <Td>{money(t.revenueCents)}</Td>
                      <Td>{number(t.skuCount)}</Td>
                    </>
                  )}
                  <Td>{number(t.staffCount)}</Td>
                  <Td>
                    <StatusPill status={t.status} />
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/stores/${t.slug}`}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Manage
                    </Link>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <Td className="py-10 text-center text-ink-500" >
                    No stores match that filter.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card>

      {onboarding && (
        <OnboardDialog
          onClose={() => setOnboarding(false)}
          onDone={() => {
            setOnboarding(false);
            reload();
          }}
        />
      )}
    </Shell>
  );
}

/**
 * Onboarding really provisions: the API creates a Postgres database, pushes
 * the tenant schema into it and creates the owner account. It takes a few
 * seconds, so the dialog says so rather than looking hung.
 */
function OnboardDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    host: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    brandPrimary: '#0F5132',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({
      ...f,
      [key]: value,
      // Derive a slug from the name until the user edits the slug directly.
      ...(key === 'name' && !f.slug
        ? {}
        : {}),
    }));
  }

  const derivedSlug =
    form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          slug: derivedSlug,
          host: form.host || `${derivedSlug}.localhost`,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPassword: form.ownerPassword,
          brandPrimary: form.brandPrimary,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not onboard the store');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-pop"
      >
        <h2 className="text-lg font-semibold text-ink-900">Onboard a store</h2>
        <p className="mt-1 text-xs text-ink-500">
          Creates a dedicated Postgres database, applies the tenant schema, and sets up the
          owner account.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <Field label="Store name">
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
              placeholder="Rim City"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint={`Database: treadcart_t_${derivedSlug.replace(/-/g, '_') || '…'}`}>
              <input
                value={derivedSlug}
                onChange={(e) => set('slug', e.target.value)}
                className={inputClass}
                placeholder="rimcity"
                pattern="[a-z0-9][a-z0-9-]{1,40}"
              />
            </Field>
            <Field label="Hostname" hint="Leave blank for <slug>.localhost">
              <input
                value={form.host}
                onChange={(e) => set('host', e.target.value)}
                className={inputClass}
                placeholder="rimcity.localhost"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner name">
              <input
                required
                value={form.ownerName}
                onChange={(e) => set('ownerName', e.target.value)}
                className={inputClass}
                placeholder="Jordan Reyes"
              />
            </Field>
            <Field label="Owner email">
              <input
                required
                type="email"
                value={form.ownerEmail}
                onChange={(e) => set('ownerEmail', e.target.value)}
                className={inputClass}
                placeholder="owner@rimcity.test"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner password" hint="At least 10 characters">
              <input
                required
                type="password"
                minLength={10}
                value={form.ownerPassword}
                onChange={(e) => set('ownerPassword', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Brand colour">
              <input
                type="color"
                value={form.brandPrimary}
                onChange={(e) => set('brandPrimary', e.target.value)}
                className="h-[38px] w-full rounded-lg border border-ink-300 bg-surface px-1"
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Provisioning database…' : 'Onboard store'}
          </Button>
        </div>
      </form>
    </div>
  );
}
