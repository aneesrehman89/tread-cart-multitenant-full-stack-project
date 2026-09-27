'use client';

import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { Shell, useRequireAuth } from '@/components/shell';
import { EditableText } from '@/components/editable';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  Pill,
  SectionHeader,
  Table,
  Td,
  Th,
  inputClass,
  titleCase,
} from '@/components/ui';

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  tenant: { slug: string; name: string; brandPrimary: string } | null;
  permissionCount: number;
}

interface Matrix {
  permissions: string[];
  roles: { role: string; permissions: string[] }[];
}

const TABS = ['Users', 'Permission matrix'] as const;

export default function UsersPage() {
  const ready = useRequireAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Users');
  const [creating, setCreating] = useState(false);

  const users = useApi<{ users: StaffRow[] }>(ready ? 'staff' : null);
  const matrix = useApi<Matrix>(ready ? 'staff/permissions' : null);

  async function toggleActive(u: StaffRow) {
    await api(`staff/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    users.reload();
  }

  async function changeRole(u: StaffRow, role: string) {
    await api(`staff/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    users.reload();
  }

  async function rename(u: StaffRow, name: string) {
    await api(`staff/${u.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    users.reload();
  }

  return (
    <Shell breadcrumb={['Users & permissions']}>
      <PageHeader
        title="Users & permissions"
        subtitle="Platform staff and store staff, and what each role can do"
        action={<Button onClick={() => setCreating(true)}>+ Add user</Button>}
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

      {tab === 'Users' && (
        <>
          {users.error && <ErrorNote message={users.error} onRetry={users.reload} />}
          <Card padded={false}>
            {users.loading && !users.data ? (
              <Loading />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Scope</Th>
                    <Th>Role</Th>
                    <Th>Permissions</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {users.data?.users.map((u) => (
                    <tr key={u.id} className="hover:bg-ink-50">
                      <Td className="font-medium text-ink-900">
                        <EditableText value={u.name} onSave={(name) => rename(u, name)} />
                      </Td>
                      <Td>{u.email}</Td>
                      <Td>
                        {u.tenant ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: u.tenant.brandPrimary }}
                            />
                            {u.tenant.name}
                          </span>
                        ) : (
                          <Pill tone="success">Platform</Pill>
                        )}
                      </Td>
                      <Td>
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value)}
                          className="rounded-lg border border-ink-300 bg-surface px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                        >
                          {(matrix.data?.roles ?? []).map((r) => (
                            <option key={r.role} value={r.role}>
                              {titleCase(r.role)}
                            </option>
                          ))}
                        </select>
                      </Td>
                      <Td className="text-ink-500">{u.permissionCount}</Td>
                      <Td>
                        <Pill tone={u.isActive ? 'success' : 'danger'}>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </Pill>
                      </Td>
                      <Td className="text-right">
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          {u.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'Permission matrix' && (
        <Card padded={false}>
          <SectionHeader
            title="Permission matrix"
            subtitle="Read straight from the API's RBAC table — this is what the server actually enforces."
          />
          {matrix.loading && !matrix.data ? (
            <Loading />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <Th className="sticky left-0 bg-surface">Permission</Th>
                    {matrix.data?.roles.map((r) => (
                      <Th key={r.role} className="text-center">
                        {titleCase(r.role)}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.data?.permissions.map((p) => (
                    <tr key={p} className="hover:bg-ink-50">
                      <Td className="sticky left-0 bg-surface font-mono text-2xs text-ink-700">
                        {p}
                      </Td>
                      {matrix.data?.roles.map((r) => (
                        <Td key={r.role} className="text-center">
                          {r.permissions.includes(p) ? (
                            <span className="text-brand-600" title="allowed">
                              ✓
                            </span>
                          ) : (
                            <span className="text-ink-300" title="denied">
                              ·
                            </span>
                          )}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {creating && (
        <CreateUserDialog
          roles={matrix.data?.roles.map((r) => r.role) ?? []}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            users.reload();
          }}
        />
      )}
    </Shell>
  );
}

function CreateUserDialog({
  roles,
  onClose,
  onDone,
}: {
  roles: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: stores } = useApi<{ tenants: { slug: string; name: string }[] }>('tenants');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'SUPPORT',
    tenantSlug: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPlatform = form.role === 'PLATFORM_ADMIN';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('staff', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          tenantSlug: isPlatform ? null : form.tenantSlug,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-card bg-surface p-6 shadow-pop">
        <h2 className="text-lg font-semibold text-ink-900">Add user</h2>

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
          {!isPlatform && (
            <Field label="Store" hint="Every role except platform admin is scoped to one store">
              <select
                required
                value={form.tenantSlug}
                onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}
                className={inputClass}
              >
                <option value="">Select a store…</option>
                {(stores?.tenants ?? []).map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </div>
  );
}
