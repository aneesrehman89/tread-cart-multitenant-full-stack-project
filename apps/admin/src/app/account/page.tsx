'use client';

import { useState } from 'react';
import { api, initials, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import {
  Avatar,
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

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export default function AccountPage() {
  const ready = useRequireAuth();
  const me = useApi<Me>(ready ? 'auth/me' : null);
  const sessions = useApi<{ sessions: SessionRow[] }>(ready ? 'auth/sessions' : null);

  return (
    <Shell breadcrumb={['My account']}>
      <PageHeader
        title="My account"
        subtitle="Your profile, password, and where you're currently signed in."
      />

      {me.error && <ErrorNote message={me.error} onRetry={me.reload} />}
      {me.loading && !me.data && <Loading />}

      {me.data && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            <ProfileCard me={me.data} onSaved={me.reload} />
            <PasswordCard onChanged={sessions.reload} />
            <SessionsCard state={sessions} />
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-ink-900">Role & access</h3>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-ink-500">Role</span>
              <Pill tone="success">{titleCase(me.data.role)}</Pill>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-600">
              Full access to every module — stores, catalog, orders, support, marketing and
              platform settings.
            </p>

            <p className="mt-5 mb-2 text-2xs font-medium uppercase tracking-wide text-ink-500">
              {me.data.permissions.length} permissions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {me.data.permissions.map((p) => (
                <code
                  key={p}
                  className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-600"
                >
                  {p}
                </code>
              ))}
            </div>
          </Card>
        </div>
      )}
    </Shell>
  );
}

function ProfileCard({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('auth/me', { method: 'PATCH', body: JSON.stringify({ name, email }) });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar label={initials(me.name)} size="lg" />
          <div>
            <p className="text-base font-semibold text-ink-900">{me.name}</p>
            <div className="mt-1">
              <Pill tone="success">{titleCase(me.role)}</Pill>
            </div>
          </div>
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {editing ? (
        <form onSubmit={save} className="mt-5 space-y-4 border-t border-ink-200 pt-5">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setName(me.name);
                setEmail(me.email);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-5 divide-y divide-ink-100 border-t border-ink-200">
          <div className="flex justify-between py-3 text-sm">
            <dt className="text-ink-500">Email</dt>
            <dd className="text-ink-900">{me.email}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function PasswordCard({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ otherSessionsRevoked: number }>('auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setResult(
        `Password changed. ${res.otherSessionsRevoked} other session(s) were signed out.`,
      );
      setOpen(false);
      setCurrent('');
      setNext('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Password & security</h3>
          <p className="mt-0.5 text-xs text-ink-500">
            Changing your password signs out every other device.
          </p>
        </div>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Change password
          </Button>
        )}
      </div>

      {result && <p className="mt-4 text-xs text-brand-600">{result}</p>}
      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-ink-200 pt-5">
          <Field label="Current password">
            <input
              required
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="New password" hint="At least 10 characters">
            <input
              required
              type="password"
              minLength={10}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** Reads the real Session rows from the control database. */
function SessionsCard({
  state,
}: {
  state: ReturnType<typeof useApi<{ sessions: SessionRow[] }>>;
}) {
  const [busy, setBusy] = useState(false);

  async function revoke(id: string) {
    setBusy(true);
    try {
      await api(`auth/sessions/${id}`, { method: 'DELETE' });
      state.reload();
    } finally {
      setBusy(false);
    }
  }

  async function revokeOthers() {
    setBusy(true);
    try {
      await api('auth/sessions/revoke-others', { method: 'POST' });
      state.reload();
    } finally {
      setBusy(false);
    }
  }

  const rows = state.data?.sessions ?? [];

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink-900">Active sessions</h3>
        <span className="text-xs text-ink-500">{rows.length} signed in</span>
      </div>

      {state.loading && !state.data && <Loading />}

      <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-200">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink-900">{describeAgent(s.userAgent)}</p>
              <p className="text-2xs text-ink-500">
                {s.ip ?? 'unknown IP'} · last active {relativeTime(s.lastSeenAt)}
              </p>
            </div>
            {s.isCurrent ? (
              <Pill tone="success">This device</Pill>
            ) : (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => revoke(s.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      {rows.length > 1 && (
        <Button variant="danger" size="sm" className="mt-4" disabled={busy} onClick={revokeOthers}>
          Sign out all other sessions
        </Button>
      )}
    </Card>
  );
}

/** A readable label from the user agent, without pulling in a parser. */
function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : 'Unknown OS';
  return `${browser} on ${os}`;
}
