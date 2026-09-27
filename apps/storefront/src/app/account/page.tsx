'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { ShopLayout, type Shopper } from '@/components/shop-chrome';
import { Button, Card, ErrorNote, Field, Loading, Pill, inputClass } from '@/components/ui';
import { GoogleButton } from '@/components/google-button';
import { useApi as useApiHook } from '@/lib/api';

/**
 * Account page. A signed-out visitor gets sign-in / register here, but the
 * main path into an account is the checkout flow — nobody is asked to create
 * one before they have decided to buy something.
 */
export default function AccountPage() {
  const me = useApi<Shopper>('auth/me');

  if (me.loading && !me.data) return <ShopLayout><Loading /></ShopLayout>;
  if (!me.data?.id) return <ShopLayout><SignedOut onDone={() => me.reload()} /></ShopLayout>;

  return (
    <ShopLayout>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-ink-900">My account</h1>

        <Card>
          <h2 className="text-sm font-semibold text-ink-900">Details</h2>
          <dl className="mt-3 divide-y divide-ink-100 border-t border-ink-200 text-sm">
            <Row label="Name" value={[me.data.firstName, me.data.lastName].filter(Boolean).join(' ') || '—'} />
            <Row label="Email" value={me.data.email} />
          </dl>
        </Card>

        <Card className="mt-5">
          <h2 className="text-sm font-semibold text-ink-900">Saved addresses</h2>
          {me.data.addresses.length === 0 ? (
            <p className="mt-2 text-xs text-ink-500">
              No addresses yet — you can add one during checkout.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {me.data.addresses.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-200 p-3">
                  <span className="text-xs leading-relaxed text-ink-700">
                    <span className="font-medium text-ink-900">{a.line1}</span>
                    {a.isDefault && <span className="ml-2 align-middle"><Pill tone="neutral">Default</Pill></span>}
                    <br />
                    {a.city}, {a.region} {a.postalCode}, {a.country}
                  </span>
                  <button
                    onClick={async () => {
                      await api(`auth/addresses/${a.id}`, { method: 'DELETE' });
                      me.reload();
                    }}
                    className="shrink-0 text-xs font-medium text-ink-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="mt-5 flex gap-2">
          <Link href="/orders"><Button variant="secondary">My orders</Button></Link>
          <Button
            variant="danger"
            onClick={async () => {
              await api('auth/logout', { method: 'POST' }).catch(() => undefined);
              window.location.href = '/';
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </ShopLayout>
  );
}

function SignedOut({ onDone }: { onDone: () => void }) {
  const providers = useApiHook<{ google: boolean }>('auth/providers');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(mode === 'login' ? 'auth/login' : 'auth/register', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'login'
            ? { email: form.email, password: form.password }
            : { email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName || undefined },
        ),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <Card>
        <h1 className="text-lg font-semibold text-ink-900">
          {mode === 'login' ? 'Sign in' : 'Create an account'}
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          You can also sign in later, during checkout.
        </p>

        {error && <div className="mt-4"><ErrorNote message={error} /></div>}

        {providers.data?.google && (
          <div className="mt-5">
            <GoogleButton next="/account" />
            <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-2xs text-ink-400">or use your email</span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Last name">
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} />
              </Field>
            </div>
          )}
          <Field label="Email">
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
            <input required type="password" minLength={mode === 'register' ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-500">
          {mode === 'login' ? 'New here? ' : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            className="font-medium text-brand-600 hover:underline"
          >
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-xs font-medium text-ink-900">{value}</dd>
    </div>
  );
}
