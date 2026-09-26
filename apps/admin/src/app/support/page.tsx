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

const STATUS_FILTERS = ['All open', 'OPEN', 'PENDING', 'ESCALATED', 'RESOLVED'] as const;

export default function SupportPage() {
  const ready = useRequireAuth();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (statusFilter !== 'All open') query.set('status', statusFilter);
  if (search.trim()) query.set('q', search.trim());

  const list = useApi<{ tickets: TicketSummary[]; openCount: number }>(
    ready ? `support/tickets?${query.toString()}` : null,
  );

  // Select the first ticket once the queue loads, so the pane is never blank.
  useEffect(() => {
    const first = list.data?.tickets[0]?.id;
    if (first && !list.data?.tickets.some((t) => t.id === selectedId)) {
      setSelectedId(first);
    }
  }, [list.data, selectedId]);

  return (
    <Shell breadcrumb={['Support']}>
      <PageHeader
        title="Support"
        subtitle={`${list.data?.openCount ?? 0} tickets in the queue, across every store`}
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
            {list.data?.tickets.length === 0 && <EmptyState title="Queue is clear" />}
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
                  <SlaPill dueAt={t.slaDueAt} />
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
          <TicketThread id={selectedId} onChanged={list.reload} />
        ) : (
          <Card>
            <EmptyState title="Select a ticket" body="Pick a conversation from the queue." />
          </Card>
        )}
      </div>
    </Shell>
  );
}

/** Turns an SLA deadline into the "2h left" / "overdue" pill from the mockup. */
function SlaPill({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return null;
  const msLeft = new Date(dueAt).getTime() - Date.now();
  const overdue = msLeft < 0;
  const hours = Math.round(Math.abs(msLeft) / 3_600_000);

  return (
    <Pill tone={overdue ? 'danger' : hours <= 4 ? 'warning' : 'neutral'}>
      {overdue ? `SLA ${hours}h over` : `SLA ${hours}h left`}
    </Pill>
  );
}

function TicketThread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<TicketDetail>(`support/tickets/${id}`);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api(`support/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply('');
      reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    await api(`support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    reload();
    onChanged();
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Card><Loading /></Card>;
  if (!data) return null;

  return (
    <Card padded={false} className="flex max-h-[calc(100vh-13rem)] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{data.subject}</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {data.tenant.name} · {data.requesterName} · {data.number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SlaPill dueAt={data.slaDueAt} />
          <select
            value={data.status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-ink-300 bg-surface px-2 py-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
          >
            {['OPEN', 'PENDING', 'ESCALATED', 'RESOLVED', 'CLOSED'].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
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
                className={`inline-block rounded-card px-3.5 py-2.5 text-sm ${
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
