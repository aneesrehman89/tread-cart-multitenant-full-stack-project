'use client';

export const SIGNUP_STEPS = ['Account', 'Store page', 'Business info', 'KYC', 'Review'] as const;
export type SignupStep = (typeof SIGNUP_STEPS)[number];

/** The numbered progress rail across the top of the signup wizard. */
export function Stepper({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex w-full max-w-3xl items-center">
      {SIGNUP_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  done
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : active
                      ? 'border-brand-600 bg-surface text-brand-700'
                      : 'border-ink-300 bg-surface text-ink-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-2xs ${
                  active ? 'font-semibold text-ink-900' : 'text-ink-500'
                }`}
              >
                {label}
              </span>
            </div>
            {i < SIGNUP_STEPS.length - 1 && (
              <span
                className={`mx-2 -mt-5 h-0.5 flex-1 ${done ? 'bg-brand-700' : 'bg-ink-200'}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
