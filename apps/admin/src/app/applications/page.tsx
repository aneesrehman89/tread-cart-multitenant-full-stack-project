'use client';

import { useEffect, useState } from 'react';
import { api, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  Pill,
  SectionHeader,
  StatusPill,
  inputClass,
  titleCase,
} from '@/components/ui';

interface Application {
  id: string;
  status: string;
  contactName: string;
  email: string;
  phone: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  storeName: string | null;
  storeSlug: string | null;
  category: string | null;
  brandPrimary: string;
  brandAccent: string;
  legalName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  kycDocType: string | null;
  kycFrontKey: string | null;
  kycBackKey: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  tenant: { slug: string; name: string; status: string } | null;
  reviewedBy: { name: string } | null;
}

const FILTERS = ['All', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;

export default function ApplicationsPage() {
  const ready = useRequireAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useApi<{ applications: Application[]; pendingCount: number }>(
    ready ? `applications${filter === 'All' ? '' : `?status=${filter}`}` : null,
  );

  useEffect(() => {
    if (!list.data) return;
    const stillVisible = list.data.applications.some((a) => a.id === selectedId);
    if (!stillVisible) setSelectedId(list.data.applications[0]?.id ?? null);
  }, [list.data, selectedId]);

  return (
    <Shell breadcrumb={['Seller applications']}>
      <PageHeader
        title="Seller applications"
        subtitle={
          list.data
            ? `${list.data.pendingCount} waiting for review`
            : 'Loading…'
        }
      />

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card padded={false} className="flex max-h-[calc(100vh-13rem)] flex-col">
          <div className="flex flex-wrap gap-1 border-b border-ink-200 p-3">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2 py-1 text-2xs font-medium transition-colors ${
                  filter === f ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {f === 'All' ? 'All' : titleCase(f)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {list.loading && !list.data && <Loading />}
            {list.data?.applications.length === 0 && (
              <EmptyState title="Nothing to review" body="New seller applications appear here." />
            )}
            {list.data?.applications.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`block w-full border-b border-ink-100 px-4 py-3 text-left transition-colors ${
                  selectedId === a.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">{a.storeName ?? 'Unnamed store'}</p>
                  <StatusPill status={a.status} />
                </div>
                <p className="mt-1 text-2xs text-ink-500">
                  {a.contactName} · {a.city ?? '—'}
                </p>
                {a.submittedAt && (
                  <p className="mt-1 text-2xs text-ink-400">
                    submitted {relativeTime(a.submittedAt)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </Card>

        {selectedId ? (
          <ApplicationDetail id={selectedId} onChanged={list.reload} />
        ) : (
          <Card>
            <EmptyState title="Select an application" />
          </Card>
        )}
      </div>
    </Shell>
  );
}

function ApplicationDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<Application>(`applications/${id}`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setActionError(null);
  }, [id]);

  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`applications/${id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
      reload();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Card><Loading /></Card>;
  if (!data) return null;

  const pending = data.status === 'SUBMITTED' || data.status === 'UNDER_REVIEW';

  return (
    <div className="space-y-5">
      <Card padded={false}>
        <SectionHeader
          title={data.storeName ?? 'Unnamed store'}
          subtitle={`${data.category ?? '—'} · treadcart.com/store/${data.storeSlug ?? '—'}`}
          action={<StatusPill status={data.status} />}
        />

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Group title="Contact">
            <Row label="Name" value={data.contactName} />
            <Row
              label="Email"
              value={data.email}
              badge={data.emailVerifiedAt ? 'Verified' : 'Unverified'}
              ok={!!data.emailVerifiedAt}
            />
            <Row
              label="Phone"
              value={data.phone}
              badge={data.phoneVerifiedAt ? 'Verified' : 'Unverified'}
              ok={!!data.phoneVerifiedAt}
            />
          </Group>

          <Group title="Business">
            <Row label="Legal name" value={data.legalName ?? '—'} />
            <Row label="Tax / NTN" value={data.taxId ?? '—'} />
            <Row
              label="Address"
              value={
                data.addressLine1
                  ? `${data.addressLine1}, ${data.city}, ${data.region} ${data.postalCode}, ${data.country}`
                  : '—'
              }
            />
          </Group>

          <Group title="KYC documents">
            <Row label="Type" value={data.kycDocType ?? '—'} />
            <Row label="Front" value={data.kycFrontKey ?? 'Not provided'} mono />
            <Row label="Back" value={data.kycBackKey ?? 'Not provided'} mono />
          </Group>

          <Group title="Branding">
            <div className="flex items-center gap-2 py-1.5">
              <span
                className="h-5 w-5 rounded"
                style={{ backgroundColor: data.brandPrimary }}
              />
              <code className="font-mono text-2xs text-ink-700">{data.brandPrimary}</code>
              <span className="h-5 w-5 rounded" style={{ backgroundColor: data.brandAccent }} />
              <code className="font-mono text-2xs text-ink-700">{data.brandAccent}</code>
            </div>
            {data.tenant && (
              <Row label="Provisioned store" value={`${data.tenant.name} (${data.tenant.status})`} />
            )}
          </Group>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink-900">Decision</h3>

        {data.reviewNote && (
          <p className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-700">
            {data.reviewedBy?.name ? `${data.reviewedBy.name}: ` : ''}
            {data.reviewNote}
          </p>
        )}

        {actionError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {actionError}
          </p>
        )}

        {pending ? (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the applicant (required to reject)"
              className={`${inputClass} mt-3`}
            />
            <p className="mt-2 text-2xs text-ink-500">
              Approving creates a dedicated Postgres database for this store, applies the tenant
              schema and makes {data.contactName} its owner. It takes a few seconds.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.status === 'SUBMITTED' && (
                <Button variant="secondary" disabled={busy} onClick={() => act('review')}>
                  Start review
                </Button>
              )}
              <Button disabled={busy} onClick={() => act('approve', { note: note || undefined })}>
                {busy ? 'Working…' : 'Approve & provision store'}
              </Button>
              <Button
                variant="danger"
                disabled={busy || !note.trim()}
                onClick={() => act('reject', { note })}
                title={!note.trim() ? 'A rejection needs a reason' : undefined}
              >
                Reject
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-ink-500">
            {titleCase(data.status)}
            {data.reviewedAt && ` ${relativeTime(data.reviewedAt)}`}
            {data.reviewedBy && ` by ${data.reviewedBy.name}`}.
          </p>
        )}
      </Card>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-500">{title}</h4>
      <dl className="divide-y divide-ink-100 border-t border-ink-200">{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  badge,
  ok,
  mono,
}: {
  label: string;
  value: string;
  badge?: string;
  ok?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-2xs text-ink-500">{label}</dt>
      <dd className={`text-right text-xs text-ink-800 ${mono ? 'break-all font-mono text-2xs' : ''}`}>
        {value}
        {badge && (
          <span className="ml-2 inline-block align-middle">
            <Pill tone={ok ? 'success' : 'warning'}>{badge}</Pill>
          </span>
        )}
      </dd>
    </div>
  );
}
