'use client';

import { useRef } from 'react';

// Focus is moved via refs; pasting a full code fills every box.
export function OtpInput({
  length = 6,
  value,
  onChange,
  disabled,
}: {
  length?: number;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setAt(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) {
      const next = [...value];
      next[index] = '';
      onChange(next);
      return;
    }

    // Spread everything typed or pasted from this box onwards.
    const next = [...value];
    for (let i = 0; i < digits.length && index + i < length; i += 1) {
      next[index + i] = digits[i]!;
    }
    onChange(next);

    const landed = Math.min(index + digits.length, length - 1);
    refs.current[landed]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      // Step back into the previous box so a mistyped code can be cleared.
      e.preventDefault();
      const next = [...value];
      next[index - 1] = '';
      onChange(next);
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  }

  return (
    <div className="flex items-center gap-2">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ''}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            setAt(i, e.clipboardData.getData('text'));
          }}
          onFocus={(e) => e.target.select()}
          className="h-11 w-11 rounded-lg border border-ink-300 text-center text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
        />
      ))}
    </div>
  );
}
