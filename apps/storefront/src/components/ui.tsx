'use client';

import { useState, type ReactNode } from 'react';
import { moneyCompact, number as fmtNumber } from '@/lib/api';

// --- surfaces -------------------------------------------------------------

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      style={{ borderRadius: 'var(--card-radius, 12px)' }}
      className={`border border-ink-200 bg-surface shadow-card ${padded ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// --- stat tile ------------------------------------------------------------

export function StatCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  /** Percent change vs the previous window; null means "no prior data". */
  delta?: number | null;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">{value}</p>
      {delta !== undefined && (
        <p className="mt-2 text-xs">
          {delta === null ? (
            <span className="text-ink-500">No prior period</span>
          ) : (
            <span className={delta >= 0 ? 'text-brand-600' : 'text-red-600'}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% vs last month
            </span>
          )}
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

// --- pills ----------------------------------------------------------------

const PILL_TONES = {
  success: 'bg-brand-100 text-brand-700 ring-brand-200',
  warning: 'bg-amber-100 text-amber-800 ring-amber-200',
  danger: 'bg-red-100 text-red-700 ring-red-200',
  info: 'bg-blue-100 text-blue-700 ring-blue-200',
  neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: PillTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium ring-1 ring-inset ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Keeps status colour consistent everywhere a status is rendered. */
export function toneForStatus(status: string): PillTone {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
    case 'LIVE':
    case 'DELIVERED':
    case 'PAID':
    case 'RESOLVED':
      return 'success';
    case 'PENDING':
    case 'PROVISIONING':
    case 'SCHEDULED':
    case 'AWAITING_PAYMENT':
    case 'FULFILLING':
      return 'warning';
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'ESCALATED':
    case 'URGENT':
      return 'danger';
    case 'SHIPPED':
    case 'OPEN':
      return 'info';
    default:
      return 'neutral';
  }
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={toneForStatus(status)}>{titleCase(status)}</Pill>;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// --- avatar ---------------------------------------------------------------

export function Avatar({
  label,
  color,
  size = 'md',
}: {
  label: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = { sm: 'h-6 w-6 text-2xs', md: 'h-9 w-9 text-xs', lg: 'h-14 w-14 text-lg' };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white ${sizes[size]}`}
      style={{ backgroundColor: color ?? '#15543A' }}
    >
      {label}
    </span>
  );
}

// --- buttons --------------------------------------------------------------

// Primary follows the store theme; other variants stay neutral.
const BUTTON_VARIANTS = {
  primary: 'text-[var(--btn-fg,#fff)] hover:brightness-110 disabled:opacity-60',
  secondary: 'bg-surface text-ink-700 ring-1 ring-inset ring-ink-300 hover:bg-ink-50',
  danger: 'bg-surface text-red-600 ring-1 ring-inset ring-red-300 hover:bg-red-50',
  ghost: 'text-ink-600 hover:bg-ink-100',
} as const;

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: {
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: 'sm' | 'md';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };
  const themed =
    variant === 'primary'
      ? {
          backgroundColor: 'var(--btn-bg, #1F6B46)',
          color: 'var(--btn-fg, #fff)',
          border: '1px solid var(--btn-border, transparent)',
          borderRadius: 'var(--btn-radius, 0.5rem)',
        }
      : { borderRadius: 'var(--btn-radius, 0.5rem)' };

  return (
    <button
      {...rest}
      style={{ ...themed, ...rest.style }}
      className={`inline-flex items-center justify-center gap-1.5 font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

// --- form fields ----------------------------------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-ink-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-ink-300 bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

// --- table ----------------------------------------------------------------

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-ink-200 px-5 py-3 text-2xs font-medium uppercase tracking-wide text-ink-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-ink-100 px-5 py-3.5 text-ink-700 ${className}`}>{children}</td>;
}

// --- states ---------------------------------------------------------------

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-8 text-sm text-ink-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
      {label}…
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {body && <p className="mt-1 text-xs text-ink-500">{body}</p>}
    </div>
  );
}

// --- charts ---------------------------------------------------------------

// Single-series SVG chart; vector-effect keeps strokes crisp when stretched.
export function LineChart({ points }: { points: { date: string; cents: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return <EmptyState title="No revenue in this window" />;

  const W = 600;
  const H = 180;
  const PAD_Y = 12;

  const max = Math.max(...points.map((p) => p.cents), 1);
  const stepX = points.length > 1 ? W / (points.length - 1) : 0;

  const xy = points.map((p, i) => ({
    x: i * stepX,
    y: H - PAD_Y - (p.cents / max) * (H - PAD_Y * 2),
    ...p,
  }));

  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const active = hover !== null ? xy[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-48 w-full overflow-visible"
        role="img"
        aria-label="Revenue trend, last 30 days"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F6B46" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1F6B46" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines at quarters of the max. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = H - PAD_Y - f * (H - PAD_Y * 2);
          return (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={y}
              y2={y}
              stroke="#E2E6E0"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        <path d={area} fill="url(#gmvFill)" />
        <path
          d={line}
          fill="none"
          stroke="#1F6B46"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1="0"
            y2={H}
            stroke="#9AA397"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Invisible wide hit areas: the line itself is far too thin to hover. */}
        {xy.map((p, i) => (
          <rect
            key={p.date}
            x={p.x - stepX / 2}
            y={0}
            width={stepX || W}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {active && (
          <circle
            cx={active.x}
            cy={active.y}
            r="4"
            fill="#FFFFFF"
            stroke="#1F6B46"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            style={{ transformBox: 'fill-box' }}
          />
        )}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-2xs text-white"
          style={{ left: `${(active.x / W) * 100}%` }}
        >
          {new Date(active.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' · '}
          {moneyCompact(active.cents)}
        </div>
      )}

      <div className="mt-2 flex justify-between text-2xs text-ink-400">
        <span>{formatDay(points[0]!.date)}</span>
        <span>{formatDay(points[points.length - 1]!.date)}</span>
      </div>
    </div>
  );
}

function formatDay(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Orders-by-status donut, drawn with stroke-dasharray arcs. */
export function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <EmptyState title="No orders yet" />;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0 -rotate-90">
        {slices.map((s) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const el = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="space-y-2 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-ink-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-ink-800">{titleCase(s.label)}</span>
            <span className="text-ink-500">
              {fmtNumber(s.value)} · {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
