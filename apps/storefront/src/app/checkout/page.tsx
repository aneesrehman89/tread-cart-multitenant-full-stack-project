'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, money, useApi } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { ShopLayout, type Shopper } from '@/components/shop-chrome';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  Pill,
  inputClass,
} from '@/components/ui';
import { GoogleButton } from '@/components/google-button';

/**
 * Checkout: Browse → Cart → **Sign in / register → address → pay** → order.
 *
 * Authentication happens here rather than up front, so a shopper can fill a
 * cart as a guest and only create an account once they have decided to buy.
 * The cart is re-priced after signing in, because group pricing may change
 * what they owe.
 */
const STEPS = ['Account', 'Address', 'Payment'] as const;

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const cart = useCart();
  const params = useSearchParams();
  const me = useApi<Shopper>('auth/me');
  const [step, setStep] = useState(0);
  const [addressId, setAddressId] = useState<string | null>(null);

  const signedIn = !!me.data?.id;
  const cancelled = params.get('cancelled') === '1';

  // Once signed in, skip the account step and pick the default address.
  useEffect(() => {
    if (!signedIn) return;
    setStep((s) => (s === 0 ? 1 : s));
    const preferred = me.data?.addresses.find((a) => a.isDefault) ?? me.data?.addresses[0];
    if (preferred) setAddressId((prev) => prev ?? preferred.id);
  }, [signedIn, me.data]);

  if (cart.lines.length === 0) {
    return (
      <ShopLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card>
            <EmptyState title="Your cart is empty" body="Add something before checking out." />
            <div className="pb-6 text-center">
              <Link href="/products">
                <Button>Shop products</Button>
              </Link>
            </div>
          </Card>
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-ink-900">Checkout</h1>

        {cancelled && (
          <div className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Payment was cancelled and nothing was charged. Your cart is still here.
          </div>
        )}

        {/* Progress rail */}
        <ol className="mb-6 flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-2xs font-semibold ${
                  i < step
                    ? 'bg-brand-700 text-white'
                    : i === step
                      ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500'
                      : 'bg-ink-100 text-ink-400'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </span>
              <span className={i === step ? 'font-medium text-ink-900' : 'text-ink-500'}>
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-ink-200" />}
            </li>
          ))}
        </ol>

        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            {step === 0 && !signedIn && (
              <AccountStep
                onDone={() => {
                  // Re-price: group pricing may now apply.
                  me.reload();
                  cart.refresh();
                  setStep(1);
                }}
              />
            )}

            {step === 1 && (
              <AddressStep
                shopper={me.data}
                selectedId={addressId}
                onSelect={setAddressId}
                onSaved={() => me.reload()}
                onContinue={() => setStep(2)}
                onBack={() => (signedIn ? undefined : setStep(0))}
              />
            )}

            {step === 2 && (
              <PaymentStep addressId={addressId} onBack={() => setStep(1)} />
            )}
          </div>

          <OrderSummary />
        </div>
      </div>
    </ShopLayout>
  );
}

/** Step 1 — sign in or create an account, without leaving checkout. */
function AccountStep({ onDone }: { onDone: () => void }) {
  const providers = useApi<{ google: boolean }>('auth/providers');
  const [mode, setMode] = useState<'login' | 'register'>('register');
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
            : {
                email: form.email,
                password: form.password,
                firstName: form.firstName,
                lastName: form.lastName || undefined,
              },
        ),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-900">
        {mode === 'login' ? 'Sign in to continue' : 'Create an account'}
      </h2>
      <p className="mt-0.5 text-xs text-ink-500">
        We need an account to send your order confirmation and track delivery.
      </p>

      {providers.data?.google && (
        <div className="mt-4">
          {/* Returns to checkout, not the account page — the cart is waiting. */}
          <GoogleButton next="/checkout" />
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-2xs text-ink-400">or use your email</span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-1 rounded-lg bg-ink-100 p-1">
        {(['register', 'login'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            {m === 'register' ? "I'm new here" : 'I have an account'}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-4 space-y-4">
        {mode === 'register' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className={inputClass}
                placeholder="Areeba"
              />
            </Field>
            <Field label="Last name">
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className={inputClass}
                placeholder="Shah"
              />
            </Field>
          </div>
        )}

        <Field label="Email">
          <input
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
          <input
            required
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? 8 : undefined}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in & continue' : 'Create account & continue'}
        </Button>
      </form>
    </Card>
  );
}

/** Step 2 — pick or add a delivery address. */
function AddressStep({
  shopper,
  selectedId,
  onSelect,
  onSaved,
  onContinue,
  onBack,
}: {
  shopper: Shopper | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSaved: () => void;
  onContinue: () => void;
  onBack?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    line1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'PK',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addresses = shopper?.addresses ?? [];
  const showForm = adding || addresses.length === 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('auth/addresses', {
        method: 'POST',
        body: JSON.stringify({ ...form, isDefault: addresses.length === 0 }),
      });
      onSelect(created.id);
      setAdding(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the address');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-900">Delivery address</h2>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {addresses.length > 0 && (
        <div className="mt-4 space-y-2">
          {addresses.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                selectedId === a.id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-ink-200 hover:border-ink-300'
              }`}
            >
              <input
                type="radio"
                name="address"
                checked={selectedId === a.id}
                onChange={() => onSelect(a.id)}
                className="mt-0.5 h-3.5 w-3.5 text-brand-600 focus:ring-brand-400"
              />
              <span className="text-xs leading-relaxed text-ink-700">
                <span className="font-medium text-ink-900">{a.line1}</span>
                {a.isDefault && (
                  <span className="ml-2 align-middle">
                    <Pill tone="neutral">Default</Pill>
                  </span>
                )}
                <br />
                {a.city}, {a.region} {a.postalCode}, {a.country}
              </span>
            </label>
          ))}
        </div>
      )}

      {showForm ? (
        <form onSubmit={save} className="mt-4 space-y-4 border-t border-ink-200 pt-4">
          <Field label="Address">
            <input
              required
              value={form.line1}
              onChange={(e) => setForm({ ...form, line1: e.target.value })}
              className={inputClass}
              placeholder="5 Gulberg III"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="City">
              <input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={inputClass}
                placeholder="Lahore"
              />
            </Field>
            <Field label="Province">
              <input
                required
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className={inputClass}
                placeholder="Punjab"
              />
            </Field>
            <Field label="Postal code">
              <input
                required
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                className={inputClass}
                placeholder="54660"
              />
            </Field>
            <Field label="Country">
              <select
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={inputClass}
              >
                <option value="PK">Pakistan</option>
                <option value="AE">UAE</option>
                <option value="GB">United Kingdom</option>
                <option value="US">United States</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save address'}
            </Button>
            {addresses.length > 0 && (
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 text-xs font-medium text-brand-600 hover:underline"
        >
          + Add a new address
        </button>
      )}

      <div className="mt-5 flex justify-between border-t border-ink-200 pt-4">
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={onContinue} disabled={!selectedId}>
          Continue to payment
        </Button>
      </div>
    </Card>
  );
}

/** Step 3 — hand off to Stripe. */
function PaymentStep({ addressId, onBack }: { addressId: string | null; onBack: () => void }) {
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; number: string } | null>(null);

  async function place() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{
        order: { id: string; number: string; totalCents: number };
        paymentUrl: string | null;
        stripeConfigured: boolean;
        message?: string;
      }>('checkout/place', {
        method: 'POST',
        body: JSON.stringify({ lines: cart.lines, addressId }),
      });

      if (result.paymentUrl) {
        // Stripe Checkout is hosted, so the browser leaves the app entirely.
        cart.clear();
        window.location.href = result.paymentUrl;
        return;
      }

      // No Stripe keys configured: the order exists but is unpaid.
      setPending(result.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment');
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    if (!pending) return;
    setBusy(true);
    try {
      await api(`checkout/orders/${pending.id}/simulate-payment`, { method: 'POST' });
      cart.clear();
      router.push(`/orders/${pending.id}?paid=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-900">Payment</h2>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {pending ? (
        <div className="mt-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            Order <strong>{pending.number}</strong> was created, but Stripe is not configured on
            this environment so no payment can be taken. Set <code>STRIPE_SECRET_KEY</code> to a
            test key to use the real card flow.
          </p>
          <Button className="mt-3 w-full" disabled={busy} onClick={simulate}>
            {busy ? 'Working…' : 'Simulate payment (development only)'}
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-ink-200 p-3">
            <span className="mt-0.5">
              <StripeMark />
            </span>
            <div>
              <p className="text-xs font-medium text-ink-900">Pay by card with Stripe</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">
                You will be taken to Stripe&apos;s hosted checkout to enter your card. Card details
                never touch this store&apos;s servers.
              </p>
            </div>
          </div>

          <div className="mt-5 flex justify-between">
            <Button variant="secondary" onClick={onBack} disabled={busy}>
              Back
            </Button>
            <Button onClick={place} disabled={busy || !addressId}>
              {busy ? 'Starting…' : 'Place order'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function OrderSummary() {
  const cart = useCart();
  const q = cart.quote;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-900">Order summary</h2>

      <ul className="mt-3 space-y-2 border-b border-ink-200 pb-3">
        {q?.items.map((i) => (
          <li key={i.skuId} className="flex justify-between gap-3 text-xs">
            <span className="min-w-0 text-ink-700">
              <span className="line-clamp-1">{i.name}</span>
              <span className="text-ink-400">× {i.quantity}</span>
            </span>
            <span className="shrink-0 font-medium text-ink-900">{money(i.lineTotalCents)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-ink-600">
          <dt>Subtotal</dt>
          <dd>{money(q?.subtotalCents ?? 0)}</dd>
        </div>
        {q && q.discountCents > 0 && (
          <div className="flex justify-between text-brand-600">
            <dt>Your savings</dt>
            <dd>− {money(q.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between text-ink-600">
          <dt>Delivery</dt>
          <dd>{q?.shippingCents === 0 ? 'FREE' : money(q?.shippingCents ?? 0)}</dd>
        </div>
        <div className="flex justify-between text-ink-600">
          <dt>Tax</dt>
          <dd>{money(q?.taxCents ?? 0)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink-200 pt-2.5 text-base font-semibold text-ink-900">
          <dt>Total</dt>
          <dd>{money(q?.totalCents ?? 0)}</dd>
        </div>
      </dl>
    </Card>
  );
}

function StripeMark() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-md bg-[#635BFF] text-[10px] font-bold text-white">
      S
    </span>
  );
}
