'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { relativeTime, useApi } from '@/lib/api';
import { Button, Card, ErrorNote, Loading, Pill, titleCase } from '@/components/ui';

interface Application {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  contactName: string;
  email: string;
  phone: string | null;
  storeName: string | null;
  storeSlug: string | null;
  category: string | null;
  brandPrimary: string;
  brandAccent: string;
  legalName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  tenant: { slug: string; name: string; status: string } | null;
}

const TIMELINE = [
  { key: 'submitted', label: 'Application & documents submitted' },
  { key: 'review', label: 'Platform team reviews your details · usually within 2 business days' },
  { key: 'approved', label: "We'll email you when your store is approved" },
  { key: 'live', label: 'Sign in to your store dashboard and go live' },
] as const;

function stageOf(status: Application['status']): number {
  switch (status) {
    case 'DRAFT':
      return 0;
    case 'SUBMITTED':
      return 1;
    case 'UNDER_REVIEW':
      return 2;
    case 'APPROVED':
      return 4;
    case 'REJECTED':
      return 1;
  }
}

export default function ApplicationStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<Application>(`signup/${id}`);

  // Checking the status used to fire a silent refetch with no visible result.
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  async function check() {
    setChecking(true);
    reload();
    // Brief spinner so a same-status result still feels like an action.
    await new Promise((r) => setTimeout(r, 600));
    setChecking(false);
    setCheckedAt(new Date());
  }

  const rejected = data?.status === 'REJECTED';
  const approved = data?.status === 'APPROVED';
  const stage = data ? stageOf(data.status) : 0;

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-lg items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-700 text-xs font-bold text-white">
            T
          </span>
          <span className="text-sm font-semibold text-ink-900">TreadCart</span>
        </span>
        {/* An applicant has no session yet, so this simply leaves the flow. */}
        <Link href="/login" className="text-xs font-medium text-ink-500 hover:text-ink-800">
          Exit
        </Link>
      </div>

      <div className="mx-auto w-full max-w-lg space-y-4">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}

        {data && (
          <>
            <Card>
              <div className="text-center">
                <span
                  className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-xl ${
                    approved
                      ? 'bg-brand-100 text-brand-700'
                      : rejected
                        ? 'bg-red-100 text-red-600'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {approved ? '✓' : rejected ? '!' : '✉'}
                </span>

                <h1 className="mt-4 text-lg font-semibold text-ink-900">
                  {approved
                    ? 'Your store is approved'
                    : rejected
                      ? 'Application not approved'
                      : 'Application submitted'}
                </h1>

                <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                  {approved ? (
                    <>
                      {data.storeName} is live. Sign in with {data.email} to set up your catalog.
                    </>
                  ) : rejected ? (
                    data.reviewNote
                  ) : (
                    <>
                      Thanks for applying to sell on TreadCart,{' '}
                      {data.contactName.split(' ')[0]}. We&apos;re reviewing your business details
                      for <strong className="text-ink-700">{data.storeName}</strong>.
                    </>
                  )}
                </p>

                <div className="mt-3">
                  <Pill tone={approved ? 'success' : rejected ? 'danger' : 'warning'}>
                    {data.status === 'SUBMITTED' ? 'Pending review' : titleCase(data.status)}
                  </Pill>
                </div>
              </div>

              {!rejected && (
                <ol className="mt-6 space-y-3 border-t border-ink-200 pt-5">
                  {TIMELINE.map((item, i) => {
                    const done = stage > i;
                    const current = stage === i + 1;
                    return (
                      <li key={item.key} className="flex items-start gap-3 text-xs">
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 text-[9px] ${
                            done
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : current
                                ? 'border-amber-500 text-amber-600'
                                : 'border-ink-300'
                          }`}
                        >
                          {done ? '✓' : ''}
                        </span>
                        <span className={done || current ? 'text-ink-800' : 'text-ink-400'}>
                          {item.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {data.submittedAt && (
                <p className="mt-5 border-t border-ink-200 pt-4 text-2xs text-ink-500">
                  Submitted {relativeTime(data.submittedAt)}
                  {data.reviewedAt && ` · reviewed ${relativeTime(data.reviewedAt)}`}
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2">
                {approved ? (
                  <Link href="/login">
                    <Button className="w-full">Sign in to your dashboard</Button>
                  </Link>
                ) : rejected ? (
                  <Link href="/signup">
                    <Button variant="secondary" className="w-full">
                      Start a new application
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" className="w-full" disabled={checking} onClick={check}>
                    {checking ? (
                      <>
                        <span
                          aria-hidden
                          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600"
                        />
                        Checking…
                      </>
                    ) : (
                      'Check application status'
                    )}
                  </Button>
                )}

                {/* The result of checking, so the button is never silent. */}
                <p aria-live="polite" className="min-h-4 text-center text-2xs text-ink-500">
                  {checkedAt &&
                    !checking &&
                    (approved
                      ? 'Approved — you can sign in now.'
                      : rejected
                        ? 'A decision has been made on your application.'
                        : `Still with the review team — last checked ${checkedAt.toLocaleTimeString()}.`)}
                </p>
              </div>
            </Card>

            {/* What was actually submitted, so the applicant can verify it. */}
            <Card padded={false}>
              <button
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-ink-900">
                  What you submitted
                </span>
                <span className="text-xs text-ink-500">{showDetails ? 'Hide' : 'Show'}</span>
              </button>

              {showDetails && (
                <dl className="divide-y divide-ink-100 border-t border-ink-200 px-5">
                  <Row label="Contact" value={data.contactName} />
                  <Row label="Email" value={data.email} />
                  {data.phone && <Row label="Phone" value={data.phone} />}
                  <Row label="Store name" value={data.storeName ?? '—'} />
                  <Row label="Store address" value={`treadcart.com/store/${data.storeSlug ?? '—'}`} />
                  <Row label="Category" value={data.category ?? '—'} />
                  <Row label="Registered name" value={data.legalName ?? '—'} />
                  <Row label="Tax / NTN" value={data.taxId ?? '—'} />
                  <Row
                    label="Address"
                    value={
                      data.addressLine1
                        ? `${data.addressLine1}, ${data.city}, ${data.region} ${data.postalCode}, ${data.country}`
                        : '—'
                    }
                  />
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-xs text-ink-500">Brand colours</dt>
                    <dd className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded"
                        style={{ backgroundColor: data.brandPrimary }}
                      />
                      <span
                        className="h-4 w-4 rounded"
                        style={{ backgroundColor: data.brandAccent }}
                      />
                    </dd>
                  </div>
                </dl>
              )}
            </Card>

            <p className="text-center text-2xs text-ink-400">
              Bookmark this page — it is your application reference.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-ink-500">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink-900">{value}</dd>
    </div>
  );
}
