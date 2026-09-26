'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button, Field, inputClass } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@treadcart.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      // Full reload so the new httpOnly cookie is attached to the next request.
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-500 text-xs font-bold text-brand-950">
            T
          </span>
          <span className="text-sm font-semibold text-white">TreadCart Platform</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Run every tire and wheel store on your marketplace from one place.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-200">
            Stores, catalog, group pricing, orders and support — unified across every
            tenant on the platform, each with its own isolated database.
          </p>
        </div>

        <p className="text-2xs text-brand-300">© {new Date().getFullYear()} TreadCart, Inc.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-ink-900">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500">Access the platform admin console.</p>

          {error && (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 space-y-4">
            <Field label="Work email">
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@treadcart.com"
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

          <p className="mt-4 text-center text-2xs text-ink-500">
            Platform admin accounts only. Store staff sign in at their own store.
          </p>

          <div className="mt-8 rounded-lg border border-ink-200 bg-ink-50 p-3 text-2xs text-ink-600">
            <p className="font-medium text-ink-700">Demo credentials</p>
            <p className="mt-1">
              admin@treadcart.test · <code className="font-mono">Treadcart!2345</code>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
