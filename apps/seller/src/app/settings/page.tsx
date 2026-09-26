'use client';

import { useEffect, useState } from 'react';
import { api, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  Pill,
  inputClass,
  titleCase,
} from '@/components/ui';

interface Settings {
  slug: string;
  name: string;
  status: string;
  brandPrimary: string;
  brandAccent: string;
  logoUrl: string | null;
  databaseName: string;
  createdAt: string;
  domains: { host: string; isPrimary: boolean }[];
}

export default function SettingsPage() {
  const ready = useRequireSeller();
  const { data, error, loading, reload } = useApi<Settings>(ready ? 'settings' : null);

  const [name, setName] = useState('');
  const [primary, setPrimary] = useState('#0F5132');
  const [accent, setAccent] = useState('#84CC16');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the form once the settings arrive.
  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setPrimary(data.brandPrimary);
    setAccent(data.brandAccent);
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await api('settings', {
        method: 'PATCH',
        body: JSON.stringify({ name, brandPrimary: primary, brandAccent: accent }),
      });
      setSaved(true);
      reload();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell breadcrumb={['Storefront settings']}>
      <PageHeader
        title="Storefront settings"
        subtitle="How your store looks to customers on the marketplace"
      />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <form onSubmit={save}>
              <h2 className="text-sm font-semibold text-ink-900">Branding</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                These two colours are your white-label theme. Customers see them on your store
                page and product listings.
              </p>

              {saveError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {saveError}
                </p>
              )}

              <div className="mt-5 space-y-4">
                <Field label="Store name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Brand colour">
                    <input
                      type="color"
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                      className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
                    />
                  </Field>
                  <Field label="Accent colour">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
                    />
                  </Field>
                </div>

                <div className="rounded-lg border border-ink-200 p-3">
                  <p className="mb-2 text-2xs font-medium text-ink-500">Storefront preview</p>
                  <div
                    className="flex items-center justify-between rounded-md px-4 py-3"
                    style={{ backgroundColor: primary }}
                  >
                    <span className="text-sm font-semibold text-white">{name || data.name}</span>
                    <span
                      className="rounded px-2 py-1 text-2xs font-semibold"
                      style={{ backgroundColor: accent, color: '#0B3325' }}
                    >
                      Shop tires
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
                {saved && <span className="text-xs text-brand-600">Saved</span>}
              </div>
            </form>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink-900">Store details</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Managed by the platform — contact support to change these.
            </p>

            <dl className="mt-4 divide-y divide-ink-100 border-t border-ink-200 text-sm">
              <Row label="Status">
                <Pill tone={data.status === 'ACTIVE' ? 'success' : 'danger'}>
                  {titleCase(data.status)}
                </Pill>
              </Row>
              <Row label="Store address">
                <code className="font-mono text-2xs text-ink-700">
                  treadcart.com/store/{data.slug}
                </code>
              </Row>
              <Row label="Hostname">
                <span className="text-xs text-ink-700">
                  {data.domains.find((d) => d.isPrimary)?.host ?? '—'}
                </span>
              </Row>
              <Row label="Your database">
                <code className="font-mono text-2xs text-ink-700">{data.databaseName}</code>
              </Row>
              <Row label="Selling since">
                <span className="text-xs text-ink-700">{relativeTime(data.createdAt)}</span>
              </Row>
            </dl>

            <p className="mt-4 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-2xs leading-relaxed text-ink-600">
              Your catalog, customers and orders live in their own Postgres database. No other
              seller on TreadCart can query it, even by accident.
            </p>
          </Card>
        </div>
      )}
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
