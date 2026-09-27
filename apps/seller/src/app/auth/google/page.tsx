'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ErrorNote, Loading } from '@/components/ui';

/**
 * Landing page for the Google callback.
 *
 * The API hands over a one-time token in the URL; this swaps it for an
 * httpOnly cookie on this app's origin through the proxy, so the token never
 * lingers anywhere the browser can read it.
 */
export default function GoogleCallbackPage() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('That sign-in link is missing its token.');
      return;
    }

    api('auth/google/exchange', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => {
        // Replace, so the token in the URL is not left in history.
        window.location.replace('/');
      })
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
            <a href="/login" className="font-medium text-brand-600 hover:underline">
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
