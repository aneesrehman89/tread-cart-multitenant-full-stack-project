'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const STORE = process.env.NEXT_PUBLIC_STORE ?? 'apexauto';

/**
 * Starts the OAuth flow by leaving the SPA entirely: the API owns the client
 * secret and issues the redirect to Google.
 *
 * Points at the API directly rather than at this app's JSON proxy — the proxy
 * would follow the 302 server-side and hand back Google's sign-in HTML as a
 * JSON body instead of navigating the browser.
 *
 * The store travels in the query string because Google will redirect straight
 * back to the API, where no tenant header exists; the API signs it into the
 * OAuth state so it cannot be tampered with in transit.
 */
export function GoogleButton({
  label = 'Continue with Google',
  next = '/account',
}: {
  label?: string;
  next?: string;
}) {
  const href = `${API_URL}/v1/customer/auth/google/start?tenant=${encodeURIComponent(STORE)}&next=${encodeURIComponent(next)}`;
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-ink-300 bg-surface px-3.5 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
    >
      <GoogleMark />
      {label}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.7 35.9 44 30.6 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
