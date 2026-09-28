'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ErrorNote, Loading } from '@/components/ui';

// Swaps the one-time callback token for a cookie and removes it from history.
export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<Loading label="Finishing sign-in" />}>
      <Callback />
    </Suspense>
  );
}

function Callback() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    const next = params.get('next') ?? '/account';
    if (!token) {
      setError('That sign-in link is missing its token.');
      return;
    }

    api('auth/google/exchange', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => window.location.replace(next.startsWith('/') ? next : '/account'))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not complete sign-in'),
      );
  }, [params]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      {error ? (
        <div className="w-full max-w-sm">
          <ErrorNote message={error} />
          <p className="mt-3 text-center text-xs text-ink-500">
            <a href="/account" className="font-medium text-brand-600 hover:underline">
              Back to sign in
            </a>
          </p>
        </div>
      ) : (
        <Loading label="Finishing sign-in" />
      )}
    </div>
  );
}
