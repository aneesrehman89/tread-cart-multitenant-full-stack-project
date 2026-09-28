'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, useApi } from '@/lib/api';
import { Stepper } from '@/components/stepper';
import { OtpInput } from '@/components/otp-input';
import { PasswordInput } from '@/components/password-input';
import { Button, Card, Field, Pill, inputClass } from '@/components/ui';
import { GoogleButton } from '@/components/google-button';

// Each step saves to the API, so progress survives a refresh.
export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const providers = useApi<{ google: boolean; sms: boolean }>('auth/providers');
  const smsOn = providers.data?.sms ?? false;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [account, setAccount] = useState({
    contactName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [codes, setCodes] = useState<{ email?: string; phone?: string }>({});
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState(['', '', '', '', '', '']);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Step 2
  const [store, setStore] = useState({
    storeName: '',
    storeSlug: '',
    category: 'Tires',
    brandPrimary: '#0F5132',
    brandAccent: '#84CC16',
  });

  // Step 3
  const [business, setBusiness] = useState({
    legalName: '',
    taxId: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'PK',
  });

  // Returning from Google with the email already verified: skip to the store step.
  useEffect(() => {
    const fromGoogle = searchParams.get('application');
    const oauthError = searchParams.get('error');
    if (oauthError) setError(decodeURIComponent(oauthError));
    if (!fromGoogle) return;

    setApplicationId(fromGoogle);
    api<{ emailVerifiedAt: string | null; contactName: string; email: string; phone: string | null }>(
      `signup/${fromGoogle}`,
    )
      .then((a) => {
        setAccount((prev) => ({
          ...prev,
          contactName: a.contactName,
          email: a.email,
          phone: a.phone ?? '',
        }));
        setEmailVerified(!!a.emailVerifiedAt);
        setPhoneVerified(true);
        setStep(1);
      })
      .catch(() => setError('That Google sign-up could not be resumed. Please start again.'));
  }, [searchParams]);

  async function run<T>(fn: () => Promise<T>, onDone?: (r: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      onDone?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    await run(
      () =>
        api<{ applicationId: string; devEmailCode?: string; devPhoneCode?: string }>(
          'signup/start',
          { method: 'POST', body: JSON.stringify(account) },
        ),
      (r) => {
        setApplicationId(r.applicationId);
        setCodes({ email: r.devEmailCode, phone: r.devPhoneCode });
      },
    );
  }

  async function verifyEmail() {
    await run(
      () =>
        api(`signup/${applicationId}/verify-email`, {
          method: 'POST',
          body: JSON.stringify({ code: emailCode }),
        }),
      () => setEmailVerified(true),
    );
  }

  async function verifyPhone() {
    await run(
      () =>
        api(`signup/${applicationId}/verify-phone`, {
          method: 'POST',
          body: JSON.stringify({ code: phoneCode.join('') }),
        }),
      () => setPhoneVerified(true),
    );
  }

  const derivedSlug =
    store.storeSlug || store.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

  async function saveStore() {
    await run(
      () =>
        api(`signup/${applicationId}/store`, {
          method: 'PATCH',
          body: JSON.stringify({ ...store, storeSlug: derivedSlug }),
        }),
      () => setStep(2),
    );
  }

  async function saveBusiness() {
    await run(
      () =>
        api(`signup/${applicationId}/business`, {
          method: 'PATCH',
          body: JSON.stringify(business),
        }),
      () => setStep(3),
    );
  }

  const [submitting, setSubmitting] = useState(false);

  // Keep the spinner until navigation completes.
  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api(`signup/${applicationId}/submit`, { method: 'POST' });
      router.push(`/signup/${applicationId}/status`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your application');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto mb-10 flex max-w-3xl items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-700 text-xs font-bold text-white">
            T
          </span>
          <span className="text-sm font-semibold text-ink-900">TreadCart</span>
        </span>
        <Link href="/login" className="text-xs font-medium text-brand-600 hover:underline">
          Already selling? Sign in
        </Link>
      </div>

      <Stepper current={step} />

      <div className="mx-auto mt-8 max-w-3xl">
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {/* ---------------- Step 1: account ---------------- */}
        {step === 0 && (
          <Card>
            <h1 className="text-lg font-semibold text-ink-900">Create your seller account</h1>
            <p className="mt-1 text-xs text-ink-500">
              This is what you&apos;ll use to sign in to your store dashboard once you&apos;re
              approved.
            </p>

            {!applicationId && providers.data?.google && (
              <div className="mt-6">
                <GoogleButton />
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-ink-200" />
                  <span className="text-2xs text-ink-400">or sign up with email</span>
                  <span className="h-px flex-1 bg-ink-200" />
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <input
                  value={account.contactName}
                  onChange={(e) => setAccount({ ...account, contactName: e.target.value })}
                  className={inputClass}
                  placeholder="Bilal Khan"
                  disabled={!!applicationId}
                />
              </Field>
              <Field label="Phone number">
                <input
                  value={account.phone}
                  onChange={(e) => setAccount({ ...account, phone: e.target.value })}
                  className={inputClass}
                  placeholder="+92 300 1234567"
                  disabled={!!applicationId}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Business email">
                <input
                  type="email"
                  value={account.email}
                  onChange={(e) => setAccount({ ...account, email: e.target.value })}
                  className={inputClass}
                  placeholder="owner@yourstore.com"
                  disabled={!!applicationId}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Password" hint="At least 10 characters">
                <PasswordInput
                  value={account.password}
                  onChange={(v) => setAccount({ ...account, password: v })}
                  disabled={!!applicationId}
                />
              </Field>
              <Field label="Confirm password">
                <PasswordInput
                  value={account.confirmPassword}
                  onChange={(v) => setAccount({ ...account, confirmPassword: v })}
                  disabled={!!applicationId}
                />
                {account.confirmPassword && account.password !== account.confirmPassword && (
                  <span className="mt-1 block text-2xs text-red-600">Passwords do not match</span>
                )}
              </Field>
            </div>

            {!applicationId ? (
              <Button className="mt-6" onClick={createAccount} disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            ) : (
              <>
                {smsOn && (
                <div className="mt-8 border-t border-ink-200 pt-6">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink-900">Verify your phone number</h2>
                    {phoneVerified && <Pill tone="success">Verified</Pill>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    We&apos;ve sent a 6-digit code to {account.phone}.
                  </p>

                  {!phoneVerified && (
                    <div className="mt-3 flex items-center gap-2">
                      <OtpInput value={phoneCode} onChange={setPhoneCode} disabled={busy} />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={verifyPhone}
                        disabled={busy || phoneCode.join('').length < 6}
                      >
                        Verify
                      </Button>
                    </div>
                  )}
                  {codes.phone && !phoneVerified && (
                    <DevCode label="SMS code" code={codes.phone} />
                  )}
                </div>
                )}

                {/* Email verification */}
                <div className="mt-6 border-t border-ink-200 pt-6">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink-900">Verify your email</h2>
                    {emailVerified && <Pill tone="success">Verified</Pill>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    We&apos;ve sent a 6-digit code to {account.email}.
                  </p>

                  {!emailVerified && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                        maxLength={6}
                        placeholder="000000"
                        className={`${inputClass} max-w-[140px] text-center tracking-widest`}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={verifyEmail}
                        disabled={busy || emailCode.length < 6}
                      >
                        Verify
                      </Button>
                    </div>
                  )}
                  {codes.email && !emailVerified && (
                    <DevCode label="Email code" code={codes.email} />
                  )}
                </div>

                <div className="mt-8 flex justify-end">
                  <Button onClick={() => setStep(1)} disabled={!emailVerified || (smsOn && !phoneVerified)}>
                    Continue
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}

        {/* ---------------- Step 2: store page ---------------- */}
        {step === 1 && (
          <Card>
            <h1 className="text-lg font-semibold text-ink-900">Store page &amp; branding</h1>
            <p className="mt-1 text-xs text-ink-500">
              Your store gets its own isolated database and its own page on the marketplace. These
              colours become your storefront theme.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Store name">
                <input
                  value={store.storeName}
                  onChange={(e) => setStore({ ...store, storeName: e.target.value })}
                  className={inputClass}
                  placeholder="Rim City"
                />
              </Field>
              <Field label="Store category">
                <select
                  value={store.category}
                  onChange={(e) => setStore({ ...store, category: e.target.value })}
                  className={inputClass}
                >
                  {['Tires', 'Wheels', 'Tires & wheels', 'Accessories'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <Field
                label="Store address"
                hint={`Your database will be treadcart_t_${derivedSlug.replace(/-/g, '_') || '…'}`}
              >
                <div className="flex items-center gap-1 rounded-lg border border-ink-300 px-3 py-2 text-sm">
                  <span className="text-ink-400">treadcart.com/store/</span>
                  <input
                    value={derivedSlug}
                    onChange={(e) => setStore({ ...store, storeSlug: e.target.value })}
                    className="flex-1 font-medium text-ink-900 focus:outline-none"
                    placeholder="rimcity"
                  />
                </div>
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Brand colour" hint="Your storefront header and buttons">
                <input
                  type="color"
                  value={store.brandPrimary}
                  onChange={(e) => setStore({ ...store, brandPrimary: e.target.value })}
                  className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
                />
              </Field>
              <Field label="Accent colour" hint="Badges and calls to action">
                <input
                  type="color"
                  value={store.brandAccent}
                  onChange={(e) => setStore({ ...store, brandAccent: e.target.value })}
                  className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
                />
              </Field>
            </div>

            <div className="mt-4 rounded-lg border border-ink-200 p-3">
              <p className="mb-2 text-2xs font-medium text-ink-500">Storefront preview</p>
              <div
                className="flex items-center justify-between rounded-md px-4 py-3"
                style={{ backgroundColor: store.brandPrimary }}
              >
                <span className="text-sm font-semibold text-white">
                  {store.storeName || 'Your store'}
                </span>
                <span
                  className="rounded px-2 py-1 text-2xs font-semibold"
                  style={{ backgroundColor: store.brandAccent, color: '#0B3325' }}
                >
                  Shop now
                </span>
              </div>
            </div>

            <StepNav
              onBack={() => setStep(0)}
              onNext={saveStore}
              busy={busy}
              nextDisabled={!store.storeName || !derivedSlug}
            />
          </Card>
        )}

        {/* ---------------- Step 3: business info ---------------- */}
        {step === 2 && (
          <Card>
            <h1 className="text-lg font-semibold text-ink-900">Business information</h1>
            <p className="mt-1 text-xs text-ink-500">
              The registered details we verify your business against.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Registered business name">
                <input
                  value={business.legalName}
                  onChange={(e) => setBusiness({ ...business, legalName: e.target.value })}
                  className={inputClass}
                  placeholder="Rim City Traders (Pvt) Ltd"
                />
              </Field>
              <Field label="Tax / NTN number">
                <input
                  value={business.taxId}
                  onChange={(e) => setBusiness({ ...business, taxId: e.target.value })}
                  className={inputClass}
                  placeholder="3520212345678"
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Address">
                <input
                  value={business.addressLine1}
                  onChange={(e) => setBusiness({ ...business, addressLine1: e.target.value })}
                  className={inputClass}
                  placeholder="12 Ferozepur Road"
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <Field label="City">
                <input
                  value={business.city}
                  onChange={(e) => setBusiness({ ...business, city: e.target.value })}
                  className={inputClass}
                  placeholder="Lahore"
                />
              </Field>
              <Field label="Province">
                <input
                  value={business.region}
                  onChange={(e) => setBusiness({ ...business, region: e.target.value })}
                  className={inputClass}
                  placeholder="Punjab"
                />
              </Field>
              <Field label="Postal code">
                <input
                  value={business.postalCode}
                  onChange={(e) => setBusiness({ ...business, postalCode: e.target.value })}
                  className={inputClass}
                  placeholder="54000"
                />
              </Field>
              <Field label="Country">
                <select
                  value={business.country}
                  onChange={(e) => setBusiness({ ...business, country: e.target.value })}
                  className={inputClass}
                >
                  <option value="PK">Pakistan</option>
                  <option value="AE">UAE</option>
                  <option value="GB">United Kingdom</option>
                  <option value="US">United States</option>
                </select>
              </Field>
            </div>

            <StepNav
              onBack={() => setStep(1)}
              onNext={saveBusiness}
              busy={busy}
              nextDisabled={!business.legalName || !business.taxId || !business.city}
            />
          </Card>
        )}

        {/* ---------------- Step 4: review ---------------- */}
        {step === 3 && (
          <Card>
            <h1 className="text-lg font-semibold text-ink-900">Review &amp; submit</h1>
            <p className="mt-1 text-xs text-ink-500">
              Check everything over. You can&apos;t edit after submitting.
            </p>

            <dl className="mt-6 divide-y divide-ink-100 border-y border-ink-200">
              <Row label="Contact" value={`${account.contactName} · ${account.email}`} />
              <Row label="Phone" value={account.phone} />
              <Row label="Store" value={`${store.storeName} (treadcart.com/store/${derivedSlug})`} />
              <Row label="Category" value={store.category} />
              <Row label="Business" value={`${business.legalName} · NTN ${business.taxId}`} />
              <Row
                label="Address"
                value={`${business.addressLine1}, ${business.city}, ${business.region} ${business.postalCode}`}
              />
            </dl>

            <div className="mt-6 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={busy || submitting}>
                Back
              </Button>
              <Button onClick={submit} disabled={busy || submitting}>
                {submitting ? (
                  <>
                    <Spinner />
                    Submitting your application…
                  </>
                ) : (
                  'Submit application'
                )}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Inline spinner, sized to sit inside a button's text line. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

function StepNav({
  onBack,
  onNext,
  busy,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex justify-between">
      <Button variant="secondary" onClick={onBack} disabled={busy}>
        Back
      </Button>
      <Button onClick={onNext} disabled={busy || nextDisabled}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 py-2.5 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{value}</dd>
    </div>
  );
}

/** Development helper: shows the code the API would otherwise have emailed. */
function DevCode({ label, code }: { label: string; code: string }) {
  return (
    <p className="mt-2 text-2xs text-ink-500">
      Dev mode — {label}: <code className="font-mono font-semibold text-ink-700">{code}</code>
    </p>
  );
}
