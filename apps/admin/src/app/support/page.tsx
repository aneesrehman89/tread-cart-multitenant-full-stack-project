'use client';

import { useEffect, useState } from 'react';
import { api, initials, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  Pill,
  StatusPill,
  inputClass,
  titleCase,
  toneForStatus,
} from '@/components/ui';

interface TicketSummary {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  requesterName: string;
  slaDueAt: string | null;
  tenant: { slug: string; name: string; brandPrimary: string };
  assignee: { id: string; name: string } | null;
  _count: { messages: number };
}

interface TicketDetail extends TicketSummary {
  requesterEmail: string;
  messages: { id: string; fromStaff: boolean; authorName: string; body: string; createdAt: string }[];
}

interface Assignee {
  id: string;
  name: string;
}

const STATUS_FILTERS = ['All open', 'OPEN', 'PENDING', 'ESCALATED', 'RESOLVED'] as const;
const STATUSES = ['OPEN', 'PENDING', 'ESCALATED', 'RESOLVED', 'CLOSED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export default function SupportPage() {
  const ready = useRequireAuth();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All open');
  const [storeFilter, setStoreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const query = new URLSearchParams();
  if (statusFilter !== 'All open') query.set('status', statusFilter);
  if (storeFilter) query.set('tenantSlug', storeFilter);
  if (search.trim()) query.set('q', search.trim());

  const list = useApi<{
    tickets: TicketSummary[];
    matchCount: number;
    queueCount: number;
    unassignedCount: number;
  }>(ready ? `support/tickets?${query.toString()}` : null);

  const stores = useApi<{ tenants: { slug: string; name: string }[] }>(ready ? 'tenants' : null);
  const assignees = useApi<{ assignees: Assignee[] }>(ready ? 'support/assignees' : null);
  const me = useApi<{ id: string; name: string }>(ready ? 'auth/me' : null);

  // Keep a ticket selected while the filtered queue is non-empty.
  useEffect(() => {
    if (!list.data) return;
    const stillVisible = list.data.tickets.some((t) => t.id === selectedId);
    if (!stillVisible) setSelectedId(list.data.tickets[0]?.id ?? null);
  }, [list.data, selectedId]);

  return (
    <Shell breadcrumb={['Support']}>
      <PageHeader
        title="Support"
        subtitle={
          list.data
            ? `${list.data.queueCount} open across every store · ${list.data.unassignedCount} unassigned`
            : 'Loading queue…'
        }
        action={<Button onClick={() => setCreating(true)}>+ New ticket</Button>}
      />

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Queue */}
        <Card padded={false} className="flex max-h-[calc(100vh-13rem)] flex-col">
          <div className="space-y-2.5 border-b border-ink-200 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket, subject or customer…"
              className={inputClass}
            />
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">All stores</option>
              {(stores.data?.tenants ?? []).map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-lg px-2 py-1 text-2xs font-medium transition-colors ${
                    statusFilter === f ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-100'
                  }`}
                >
                  {f === 'All open' ? f : titleCase(f)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {list.loading && !list.data && <Loading />}
            {list.data?.tickets.length === 0 && (
              <EmptyState title="Nothing here" body="No ticket matches these filters." />
            )}
            {list.data?.tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`block w-full border-b border-ink-100 px-4 py-3 text-left transition-colors ${
                  selectedId === t.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">{t.subject}</p>
                  <SlaPill dueAt={t.slaDueAt} status={t.status} />
                </div>
                <p className="mt-1 text-2xs text-ink-500">
                  {t.tenant.name} · {t.requesterName} · {t.number}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill tone={toneForStatus(t.priority)}>{titleCase(t.priority)}</Pill>
                  <StatusPill status={t.status} />
                  <span className="text-2xs text-ink-400">
                    {t.assignee ? `assigned to ${t.assignee.name}` : 'unassigned'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Thread */}
        {selectedId ? (
          <TicketThread
            id={selectedId}
            assignees={assignees.data?.assignees ?? []}
            meId={me.data?.id ?? null}
            onChanged={list.reload}
          />
        ) : (
          <Card>
            <EmptyState title="Select a ticket" body="Pick a conversation from the queue." />
          </Card>
        )}
      </div>

      {creating && (
        <NewTicketDialog
          stores={stores.data?.tenants ?? []}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
    </Shell>
  );
}

/** Turns an SLA deadline into the "2h left" / "overdue" pill from the mockup. */
function SlaPill({ dueAt, status }: { dueAt: string | null; status: string }) {
  // A finished ticket has no clock left to run.
  if (!dueAt || status === 'RESOLVED' || status === 'CLOSED') return null;

  const msLeft = new Date(dueAt).getTime() - Date.now();
  const overdue = msLeft < 0;
  const hours = Math.round(Math.abs(msLeft) / 3_600_000);

  return (
    <Pill tone={overdue ? 'danger' : hours <= 4 ? 'warning' : 'neutral'}>
      {overdue ? `SLA ${hours}h over` : `SLA ${hours}h left`}
    </Pill>
  );
}

function TicketThread({
  id,
  assignees,
  meId,
  onChanged,
}: {
  id: string;
  assignees: Assignee[];
  meId: string | null;
  onChanged: () => void;
}) {
  const { data, error, loading, reload } = useApi<TicketDetail>(`support/tickets/${id}`);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reset the draft on ticket switch so a reply can't go to the wrong customer.
  useEffect(() => {
    setReply('');
    setActionError(null);
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      reload();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`support/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply('');
      reload();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send the reply');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Card><Loading /></Card>;
  if (!data) return null;

  return (
    <Card padded={false} className="flex max-h-[calc(100vh-13rem)] flex-col">
      <div className="border-b border-ink-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{data.subject}</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              {data.tenant.name} · {data.requesterName} &lt;{data.requesterEmail}&gt; ·{' '}
              {data.number}
            </p>
          </div>
          <SlaPill dueAt={data.slaDueAt} status={data.status} />
        </div>

        {/* Every control here writes to the API. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LabelledSelect
            label="Status"
            value={data.status}
            options={STATUSES}
            disabled={busy}
            onChange={(v) => patch({ status: v })}
          />
          <LabelledSelect
            label="Priority"
            value={data.priority}
            options={PRIORITIES}
            disabled={busy}
            onChange={(v) => patch({ priority: v })}
          />
          <label className="flex items-center gap-1.5 text-2xs text-ink-500">
            Assignee
            <select
              value={data.assignee?.id ?? ''}
              disabled={busy}
              onChange={(e) => patch({ assigneeId: e.target.value || null })}
              className="rounded-lg border border-ink-300 bg-surface px-2 py-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {meId && data.assignee?.id !== meId && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ assigneeId: meId })}>
              Assign to me
            </Button>
          )}
        </div>

        {actionError && <p className="mt-2 text-2xs text-red-600">{actionError}</p>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {data.messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.fromStaff ? 'flex-row-reverse' : ''}`}>
            <Avatar
              label={initials(m.authorName)}
              size="sm"
              color={m.fromStaff ? '#15543A' : '#9AA397'}
            />
            <div className={`max-w-[75%] ${m.fromStaff ? 'text-right' : ''}`}>
              <div
                className={`inline-block rounded-card px-3.5 py-2.5 text-left text-sm ${
                  m.fromStaff ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-800'
                }`}
              >
                {m.body}
              </div>
              <p className="mt-1 text-2xs text-ink-400">
                {m.authorName} · {relativeTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-ink-200 p-3">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type a reply…"
          className={inputClass}
        />
        <Button type="submit" disabled={busy || !reply.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </Card>
  );
}

function LabelledSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-2xs text-ink-500">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-ink-300 bg-surface px-2 py-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {titleCase(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function NewTicketDialog({
  stores,
  onClose,
  onDone,
}: {
  stores: { slug: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    subject: '',
    tenantSlug: '',
    requesterName: '',
    requesterEmail: '',
    priority: 'MEDIUM',
    slaHours: '24',
    body: '',
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
      await api('support/tickets', { method: 'POST', body: JSON.stringify(form) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the ticket');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-pop"
      >
        <h2 className="text-lg font-semibold text-ink-900">New ticket</h2>
        <p className="mt-1 text-xs text-ink-500">
          Logs a customer issue against one store and starts the SLA clock.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <Field label="Subject">
            <input
              required
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              className={inputClass}
              placeholder="Wrong tire size delivered"
            />
          </Field>

          <Field label="Store">
            <select
              required
              value={form.tenantSlug}
              onChange={(e) => set('tenantSlug', e.target.value)}
              className={inputClass}
            >
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name">
              <input
                required
                value={form.requesterName}
                onChange={(e) => set('requesterName', e.target.value)}
                className={inputClass}
                placeholder="Ayesha Siddiqui"
              />
            </Field>
            <Field label="Customer email">
              <input
                required
                type="email"
                value={form.requesterEmail}
                onChange={(e) => set('requesterEmail', e.target.value)}
                className={inputClass}
                placeholder="ayesha@example.com"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority">
              <select
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
                className={inputClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SLA (hours)">
              <input
                type="number"
                min={1}
                max={720}
                value={form.slaHours}
                onChange={(e) => set('slaHours', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="What happened">
            <textarea
              required
              rows={3}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              className={inputClass}
              placeholder="Describe the issue in the customer's words…"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create ticket'}
          </Button>
        </div>
      </form>
    </div>
  );
}
