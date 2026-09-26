'use client';

import { useCallback, useEffect, useState } from 'react';

/** Everything goes through this app's own proxy, never straight to :4000. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/tc/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body);
  }

  return body as T;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Minimal data hook: fetch on mount, expose a reload for after mutations. */
export function useApi<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { data, error, loading, reload };
}

// --- formatting -----------------------------------------------------------

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Compact form for stat tiles, where full precision is noise. */
export function moneyCompact(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function number(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function relativeTime(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const diffMs = then - Date.now();
  const abs = Math.abs(diffMs);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const [unit, ms] of units) {
    if (abs >= ms) return fmt.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
