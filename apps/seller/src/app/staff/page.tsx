'use client';

import { useState } from 'react';
import { api, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import { EditableText } from '@/components/editable';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  Pill,
  Table,
  Td,
  Th,
  inputClass,
  titleCase,
} from '@/components/ui';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  permissionCount: number;
  lastSeenAt: string | null;
}

interface RoleRow {
  role: string;
  permissions: string[];
  staffAssigned: number;
  isSystem: boolean;
}

const TABS = ['Users', 'Roles'] as const;

export default function StaffPage() {
  const ready = useRequireSeller();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Users');
  const [inviting, setInviting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = useApi<{ users: StaffRow[] }>(ready ? 'staff' : null);
  const roles = useApi<{ permissions: string[]; roles: RoleRow[] }>(ready ? 'staff/roles' : null);

  async function patch(id: string, body: Record<string, unknown>) {
    setActionError(null);
    try {
      await api(`staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      users.reload();
      roles.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <Shell breadcrumb={['Staff & roles']}>
      <PageHeader
        title="Staff & roles"
        subtitle="Who can access your store dashboard, and what each role can change"
        action={<Button onClick={() => setInviting(true)}>+ Add staff</Button>}
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

      {actionError && <ErrorNote message={actionError} />}
      {users.error && <ErrorNote message={users.error} onRetry={users.reload} />}

      {tab === 'Users' && (
        <Card padded={false}>
          {users.loading && !users.data ? (
            <Loading />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Permissions</Th>
                  <Th>Last active</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {users.data?.users.map((u) => (
                  <tr key={u.id} className="hover:bg-ink-50">
                    <Td className="font-medium text-ink-900">
                      <EditableText
                        value={u.name}
                        onSave={(name) => patch(u.id, { name })}
                        title="Rename this staff member"
                      />
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <select
                        value={u.role}
                        onChange={(e) => patch(u.id, { role: e.target.value })}
                        className="rounded-lg border border-ink-300 bg-surface px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                      >
                        {(roles.data?.roles ?? []).map((r) => (
                          <option key={r.role} value={r.role}>
                            {titleCase(r.role)}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td className="text-ink-500">{u.permissionCount}</Td>
                    <Td className="text-ink-500">
                      {u.lastSeenAt ? relativeTime(u.lastSeenAt) : 'Never'}
                    </Td>
                    <Td>
                      <Pill tone={u.isActive ? 'success' : 'danger'}>
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </Pill>
                    </Td>
                    <Td className="text-right">
                      <button
                        onClick={() => patch(u.id, { isActive: !u.isActive })}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'Roles' && (
        <>
          <div className="mb-4 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800">
            Roles define what a staff member can view, edit or fully manage across each module of
            your store dashboard — the same access levels the platform uses for its own admins,
            scoped to your store only.
          </div>

          <Card padded={false}>
            {roles.loading && !roles.data ? (
              <Loading />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Role</Th>
                    <Th>Staff assigned</Th>
                    <Th>Permissions</Th>
                    <Th>Type</Th>
                  </tr>
                </thead>
                <tbody>
                  {roles.data?.roles.map((r) => (
                    <tr key={r.role} className="align-top hover:bg-ink-50">
                      <Td className="font-medium text-ink-900">{titleCase(r.role)}</Td>
                      <Td>{r.staffAssigned}</Td>
                      <Td>
                        <div className="flex max-w-lg flex-wrap gap-1">
                          {r.permissions.map((p) => (
                            <code
                              key={p}
                              className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-600"
                            >
                              {p}
                            </code>
                          ))}
                        </div>
                      </Td>
                      <Td>
                        {r.isSystem ? (
                          <Pill tone="info">System</Pill>
                        ) : (
                          <Pill tone="neutral">Standard</Pill>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <p className="mt-3 text-2xs text-ink-500">
            These roles are defined by the platform and enforced on every API call. Custom roles
            with hand-picked permissions are not supported yet.
          </p>
        </>
      )}

      {inviting && (
        <AddStaffDialog
          roles={(roles.data?.roles ?? []).map((r) => r.role)}
          onClose={() => setInviting(false)}
          onDone={() => {
            setInviting(false);
            users.reload();
            roles.reload();
          }}
        />
      )}
    </Shell>
  );
}

function AddStaffDialog({
  roles,
  onClose,
  onDone,
}: {
  roles: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ORDER_MANAGER',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('staff', { method: 'POST', body: JSON.stringify(form) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the staff member');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-card bg-surface p-6 shadow-pop">
        <h2 className="text-lg font-semibold text-ink-900">Add staff</h2>
        <p className="mt-1 text-xs text-ink-500">
          They sign in at this same dashboard with the password you set here.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="Sadia Nawaz"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Temporary password" hint="At least 10 characters">
            <input
              required
              type="password"
              minLength={10}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputClass}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add staff'}
          </Button>
        </div>
      </form>
    </div>
  );
}
