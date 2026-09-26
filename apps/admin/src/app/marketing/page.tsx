'use client';

import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  StatusPill,
  inputClass,
  titleCase,
} from '@/components/ui';

interface Banner {
  id: string;
  title: string;
  placement: string;
  status: string;
  gradientFrom: string;
  gradientTo: string;
  startsAt: string | null;
  endsAt: string | null;
  tenant: { slug: string; name: string } | null;
}

const TABS = ['Platform banners', 'Campaigns', 'Performance'] as const;

export default function MarketingPage() {
  const ready = useRequireAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Platform banners');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);

  const { data, error, loading, reload } = useApi<{ banners: Banner[] }>(
    ready ? `marketing/banners${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}` : null,
  );

  return (
    <Shell breadcrumb={['Marketing']}>
      <PageHeader
        title="Marketing"
        subtitle="Platform banners and campaigns across every store"
        action={<Button onClick={() => setEditing('new')}>+ New banner</Button>}
      />

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
          </button>
        ))}
      </div>

      {tab === 'Platform banners' && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search banners…"
            className={`${inputClass} mb-5 max-w-sm`}
          />

          {error && <ErrorNote message={error} onRetry={reload} />}
          {loading && !data && <Loading />}

          <div className="grid gap-5 md:grid-cols-2">
            {data?.banners.map((b) => (
              <Card key={b.id} padded={false} className="overflow-hidden">
                <button
                  onClick={() => setEditing(b)}
                  className="block h-32 w-full transition-opacity hover:opacity-90"
                  style={{
                    background: `linear-gradient(135deg, ${b.gradientFrom}, ${b.gradientTo})`,
                  }}
                  aria-label={`Edit ${b.title}`}
                />
                <div className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{b.title}</p>
                    <p className="mt-0.5 text-2xs text-ink-500">
                      {titleCase(b.placement)}
                      {b.startsAt && ` · ${formatRange(b.startsAt, b.endsAt)}`}
                      {b.tenant && ` · ${b.tenant.name}`}
                    </p>
                  </div>
                  <StatusPill status={b.status} />
                </div>
              </Card>
            ))}
          </div>

          {data?.banners.length === 0 && !loading && (
            <Card>
              <EmptyState title="No banners yet" body="Create one to promote a store or a season." />
            </Card>
          )}
        </>
      )}

      {tab !== 'Platform banners' && (
        <Card>
          <EmptyState
            title={`${tab} is not built yet`}
            body="Banners are the working slice of this screen; campaigns and performance reporting need an events pipeline first."
          />
        </Card>
      )}

      {editing && (
        <BannerDialog
          banner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </Shell>
  );
}

function formatRange(start: string, end: string | null): string {
  const f = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return end ? `${f(start)}–${f(end)}` : f(start);
}

function BannerDialog({
  banner,
  onClose,
  onDone,
}: {
  banner: Banner | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    title: banner?.title ?? '',
    placement: banner?.placement ?? 'HOME_HERO',
    status: banner?.status ?? 'DRAFT',
    gradientFrom: banner?.gradientFrom ?? '#0F5132',
    gradientTo: banner?.gradientTo ?? '#166534',
    startsAt: banner?.startsAt?.slice(0, 10) ?? '',
    endsAt: banner?.endsAt?.slice(0, 10) ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      };
      await api(banner ? `marketing/banners/${banner.id}` : 'marketing/banners', {
        method: banner ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  async function remove() {
    if (!banner) return;
    setBusy(true);
    try {
      await api(`marketing/banners/${banner.id}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-pop"
      >
        <h2 className="text-lg font-semibold text-ink-900">
          {banner ? 'Edit banner' : 'New banner'}
        </h2>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div
          className="mt-5 grid h-28 place-items-center rounded-card"
          style={{ background: `linear-gradient(135deg, ${form.gradientFrom}, ${form.gradientTo})` }}
        >
          <span className="px-4 text-center text-sm font-semibold text-white">
            {form.title || 'Banner preview'}
          </span>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Title">
            <input
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClass}
              placeholder="Winter tire changeover"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Placement">
              <select
                value={form.placement}
                onChange={(e) => set('placement', e.target.value)}
                className={inputClass}
              >
                {['HOME_HERO', 'CATEGORY_PAGE', 'CHECKOUT'].map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className={inputClass}
              >
                {['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED'].map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <input
                type="date"
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Ends">
              <input
                type="date"
                value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gradient from">
              <input
                type="color"
                value={form.gradientFrom}
                onChange={(e) => set('gradientFrom', e.target.value)}
                className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
              />
            </Field>
            <Field label="Gradient to">
              <input
                type="color"
                value={form.gradientTo}
                onChange={(e) => set('gradientTo', e.target.value)}
                className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {banner ? (
            <Button type="button" variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save banner'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
