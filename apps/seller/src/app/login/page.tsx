'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Field, inputClass } from '@/components/ui';

interface StoreChoice {
  slug: string;
  name: string;
}

export default function SellerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [choices, setChoices] = useState<StoreChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent, slug?: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(slug ?? storeSlug ? { storeSlug: slug ?? storeSlug } : {}) }),
      });
      window.location.href = '/';
    } catch (err) {
      // 300 means the address is staff at more than one store; ask which.
      if (err instanceof ApiError && err.status === 300) {
        const body = err.body as { chooseStore?: StoreChoice[] } | undefined;
        setChoices(body?.chooseStore ?? []);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Sign in failed');
      }
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-500 text-xs font-bold text-brand-950">
            T
          </span>
          <span className="text-sm font-semibold text-white">TreadCart for Sellers</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Your store. Your catalog. Your own database.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-200">
            Manage tires and wheels, fitment data, trade pricing and orders — on a marketplace
            where no other seller can ever see your data.
          </p>
        </div>

        <p className="text-2xs text-brand-300">© {new Date().getFullYear()} TreadCart, Inc.</p>
      </div>

      <div className="flex items-center justify-center bg-surface px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-ink-900">Sign in to your store</h2>
          <p className="mt-1 text-sm text-ink-500">Manage your catalog, orders and staff.</p>

          {error && (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {choices ? (
            <div className="mt-6">
              <p className="mb-3 text-xs text-ink-600">
                You&apos;re staff at more than one store. Which one?
              </p>
              <div className="space-y-2">
                {choices.map((c) => (
                  <button
                    key={c.slug}
                    onClick={(e) => {
                      setStoreSlug(c.slug);
                      void submit(e, c.slug);
                    }}
                    className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-left text-sm font-medium text-ink-800 hover:border-brand-400 hover:bg-brand-50"
                  >
                    {c.name}
                    <span className="ml-1 text-2xs text-ink-400">/{c.slug}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-4">
                <Field label="Email">
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="owner@yourstore.com"
                  />
                </Field>

                <Field label="Password">
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                </Field>
              </div>

              <Button type="submit" disabled={busy} className="mt-6 w-full">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </>
          )}

          <p className="mt-6 text-center text-xs text-ink-500">
            New to TreadCart?{' '}
            <Link href="/signup" className="font-medium text-brand-600 hover:underline">
              Apply to sell
            </Link>
          </p>

          <div className="mt-8 rounded-lg border border-ink-200 bg-ink-50 p-3 text-2xs text-ink-600">
            <p className="font-medium text-ink-700">Demo store logins</p>
            <p className="mt-1">owner@apexauto.test · owner@wheelworks.test</p>
            <p>catalog@apexauto.test (limited role)</p>
            <p className="mt-1">
              password <code className="font-mono">Treadcart!2345</code>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
