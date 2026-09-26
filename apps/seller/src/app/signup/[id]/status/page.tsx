'use client';

import { use } from 'react';
import Link from 'next/link';
import { relativeTime, useApi } from '@/lib/api';
import { Button, Card, ErrorNote, Loading, Pill, titleCase } from '@/components/ui';

interface Application {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  contactName: string;
  email: string;
  storeName: string | null;
  storeSlug: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  tenant: { slug: string; name: string; status: string } | null;
}

/** The checklist from the mockup, driven by the application's real status. */
const TIMELINE = [
  { key: 'submitted', label: 'Application & documents submitted' },
  { key: 'review', label: 'Platform team reviews KYC · usually within 2 business days' },
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

  const rejected = data?.status === 'REJECTED';
  const approved = data?.status === 'APPROVED';
  const stage = data ? stageOf(data.status) : 0;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-lg">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}

        {data && (
          <Card>
            <div className="text-center">
              <span
                className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-xl ${
                  approved
                    ? 'bg-brand-100 text-brand-700'
                    : rejected
                      ? 'bg-red-100 text-red-600'
                      : 'bg-brand-100 text-brand-700'
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
                    Thanks for applying to sell on TreadCart, {data.contactName.split(' ')[0]}.
                    We&apos;re reviewing your business details and KYC documents for{' '}
                    <strong className="text-ink-700">{data.storeName}</strong>.
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

            <div className="mt-5 flex justify-center gap-2">
              {approved ? (
                <Link href="/login">
                  <Button>Sign in to your dashboard</Button>
                </Link>
              ) : rejected ? (
                <Link href="/signup">
                  <Button variant="secondary">Start a new application</Button>
                </Link>
              ) : (
                <Button variant="secondary" onClick={reload}>
                  Check application status
                </Button>
              )}
            </div>

            <p className="mt-4 text-center text-2xs text-ink-400">
              Bookmark this page — it&apos;s your application reference.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
