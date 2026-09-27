'use client';

import { useEffect, useState } from 'react';
import { api, relativeTime, useApi } from '@/lib/api';
import { Shell, useRequireSeller } from '@/components/shell';
import { useSession } from '@/components/session';
import { applyStoreTheme, BUTTON_RADII, CARD_RADII, FONTS, contrastOn } from '@/lib/theme';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  Pill,
  inputClass,
  titleCase,
} from '@/components/ui';

interface Settings {
  slug: string;
  name: string;
  status: string;
  brandPrimary: string;
  brandAccent: string;
  logoUrl: string | null;
  fontFamily: string;
  buttonStyle: string;
  buttonWeight: string;
  cardStyle: string;
  databaseName: string;
  createdAt: string;
  domains: { host: string; isPrimary: boolean }[];
  choices: {
    fonts: string[];
    buttonStyles: string[];
    buttonWeights: string[];
    cardStyles: string[];
  };
}

type Draft = Pick<
  Settings,
  'name' | 'brandPrimary' | 'brandAccent' | 'fontFamily' | 'buttonStyle' | 'buttonWeight' | 'cardStyle'
>;

export default function SettingsPage() {
  const ready = useRequireSeller();
  const session = useSession();
  const { data, error, loading, reload } = useApi<Settings>(ready ? 'settings' : null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setDraft({
      name: data.name,
      brandPrimary: data.brandPrimary,
      brandAccent: data.brandAccent,
      fontFamily: data.fontFamily,
      buttonStyle: data.buttonStyle,
      buttonWeight: data.buttonWeight,
      cardStyle: data.cardStyle,
    });
  }, [data]);

  // Paint the dashboard itself as the draft changes, so what you are editing
  // is what you are looking at. Reverted on unmount if never saved.
  useEffect(() => {
    if (draft) applyStoreTheme(draft);
  }, [draft]);

  useEffect(() => {
    return () => {
      if (session.me?.store) applyStoreTheme(session.me.store);
    };
  }, [session.me]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api('settings', { method: 'PATCH', body: JSON.stringify(draft) });
      setSaved(true);
      reload();
      // Refresh the session so the theme sticks after navigating away.
      session.reload();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell breadcrumb={['Storefront settings']}>
      <PageHeader
        title="Storefront settings"
        subtitle="How your store looks to customers — and to you, here in the dashboard"
      />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && draft && (
        <form onSubmit={save} className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <Card>
              <h2 className="text-sm font-semibold text-ink-900">Identity</h2>
              <div className="mt-4">
                <Field label="Store name">
                  <input
                    value={draft.name}
                    onChange={(e) => set('name', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">Colour</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Applied to your storefront and to this dashboard.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Brand colour">
                  <input
                    type="color"
                    value={draft.brandPrimary}
                    onChange={(e) => set('brandPrimary', e.target.value)}
                    className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
                  />
                </Field>
                <Field label="Accent colour">
                  <input
                    type="color"
                    value={draft.brandAccent}
                    onChange={(e) => set('brandAccent', e.target.value)}
                    className="h-[38px] w-full rounded-lg border border-ink-300 px-1"
                  />
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">Typeface</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                The type <em>scale</em> is fixed across every store; only the family changes.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.choices.fonts.map((key) => {
                  const font = FONTS[key];
                  if (!font) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set('fontFamily', key)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        draft.fontFamily === key
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <span
                        className="block text-base font-semibold text-ink-900"
                        style={{ fontFamily: font.stack }}
                      >
                        The quick green fox
                      </span>
                      <span className="mt-0.5 block text-2xs text-ink-500">{font.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">Controls</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Shape and weight of buttons, and how cards are framed.
              </p>

              <div className="mt-4 space-y-4">
                <ChoiceRow
                  label="Button shape"
                  options={data.choices.buttonStyles}
                  value={draft.buttonStyle}
                  onChange={(v) => set('buttonStyle', v)}
                  render={(v) => (
                    <span
                      className="inline-block px-3 py-1.5 text-2xs font-medium text-white"
                      style={{ backgroundColor: draft.brandPrimary, borderRadius: BUTTON_RADII[v] }}
                    >
                      Button
                    </span>
                  )}
                />

                <ChoiceRow
                  label="Button weight"
                  options={data.choices.buttonWeights}
                  value={draft.buttonWeight}
                  onChange={(v) => set('buttonWeight', v)}
                  render={(v) => (
                    <span
                      className="inline-block px-3 py-1.5 text-2xs font-medium"
                      style={{
                        borderRadius: BUTTON_RADII[draft.buttonStyle],
                        backgroundColor:
                          v === 'solid'
                            ? draft.brandPrimary
                            : v === 'soft'
                              ? `${draft.brandPrimary}22`
                              : 'transparent',
                        color: v === 'solid' ? contrastOn(draft.brandPrimary) : draft.brandPrimary,
                        border: `1px solid ${v === 'outline' ? draft.brandPrimary : 'transparent'}`,
                      }}
                    >
                      Button
                    </span>
                  )}
                />

                <ChoiceRow
                  label="Card style"
                  options={data.choices.cardStyles}
                  value={draft.cardStyle}
                  onChange={(v) => set('cardStyle', v)}
                  render={(v) => (
                    <span
                      className="inline-block h-7 w-12 border border-ink-300 bg-surface"
                      style={{
                        borderRadius: CARD_RADII[v],
                        boxShadow: v === 'soft' ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
                        borderWidth: v === 'bordered' ? 2 : 1,
                      }}
                    />
                  )}
                />
              </div>
            </Card>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
              {saved && <span className="text-xs text-brand-600">Saved — your storefront is updated</span>}
              {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            </div>
          </div>

          {/* Live preview + read-only facts */}
          <div className="space-y-5">
            <Card padded={false} className="overflow-hidden">
              <div className="border-b border-ink-200 px-5 py-3">
                <h2 className="text-sm font-semibold text-ink-900">Storefront preview</h2>
              </div>

              <div style={{ fontFamily: FONTS[draft.fontFamily]?.stack }}>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ backgroundColor: draft.brandPrimary }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: contrastOn(draft.brandPrimary) }}
                  >
                    {draft.name || data.name}
                  </span>
                  <span
                    className="px-2.5 py-1 text-2xs font-semibold"
                    style={{
                      backgroundColor: draft.brandAccent,
                      color: contrastOn(draft.brandAccent),
                      borderRadius: BUTTON_RADII[draft.buttonStyle],
                    }}
                  >
                    Shop tires
                  </span>
                </div>

                <div className="space-y-3 bg-canvas p-4">
                  <div
                    className="border border-ink-200 bg-surface p-3"
                    style={{
                      borderRadius: CARD_RADII[draft.cardStyle],
                      boxShadow: draft.cardStyle === 'soft' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                      borderWidth: draft.cardStyle === 'bordered' ? 2 : 1,
                    }}
                  >
                    <p className="text-2xs text-ink-500">Achilles</p>
                    <p className="text-sm font-medium text-ink-900">ATR Sport 2 225/45R17</p>
                    <p className="mt-1 text-base font-semibold text-ink-900">$129.00</p>
                    <button
                      type="button"
                      className="mt-2 w-full px-3 py-1.5 text-xs font-medium"
                      style={{
                        borderRadius: BUTTON_RADII[draft.buttonStyle],
                        backgroundColor:
                          draft.buttonWeight === 'solid'
                            ? draft.brandPrimary
                            : draft.buttonWeight === 'soft'
                              ? `${draft.brandPrimary}22`
                              : 'transparent',
                        color:
                          draft.buttonWeight === 'solid'
                            ? contrastOn(draft.brandPrimary)
                            : draft.brandPrimary,
                        border: `1px solid ${draft.buttonWeight === 'outline' ? draft.brandPrimary : 'transparent'}`,
                      }}
                    >
                      Add to cart
                    </button>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">Store details</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Managed by the platform — contact support to change these.
              </p>

              <dl className="mt-4 divide-y divide-ink-100 border-t border-ink-200 text-sm">
                <Row label="Status">
                  <Pill tone={data.status === 'ACTIVE' ? 'success' : 'danger'}>
                    {titleCase(data.status)}
                  </Pill>
                </Row>
                <Row label="Store address">
                  <code className="font-mono text-2xs text-ink-700">
                    treadcart.com/store/{data.slug}
                  </code>
                </Row>
                <Row label="Hostname">
                  <span className="text-xs text-ink-700">
                    {data.domains.find((d) => d.isPrimary)?.host ?? '—'}
                  </span>
                </Row>
                <Row label="Your database">
                  <code className="font-mono text-2xs text-ink-700">{data.databaseName}</code>
                </Row>
                <Row label="Selling since">
                  <span className="text-xs text-ink-700">{relativeTime(data.createdAt)}</span>
                </Row>
              </dl>

              <p className="mt-4 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-2xs leading-relaxed text-ink-600">
                Your catalog, customers and orders live in their own Postgres database. No other
                seller on TreadCart can query it, even by accident.
              </p>
            </Card>
          </div>
        </form>
      )}
    </Shell>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  render: (option: string) => React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors ${
              value === o ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300'
            }`}
          >
            {render(o)}
            <span className="text-2xs text-ink-600">{titleCase(o)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
