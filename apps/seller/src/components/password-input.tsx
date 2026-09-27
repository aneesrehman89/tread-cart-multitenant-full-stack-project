'use client';

import { useId, useState } from 'react';
import { inputClass } from './ui';

/**
 * Password field with a reveal toggle.
 *
 * Typing a password you cannot see, twice, is the single easiest thing to get
 * wrong in a signup form. The toggle is a real button so it is reachable by
 * keyboard, and it announces its state rather than relying on the icon alone.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'new-password',
  minLength,
  required,
  disabled,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        disabled={disabled}
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={0}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function Eye() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M8.2 4.7A7.6 7.6 0 0 1 10 4.5c5 0 8 5.5 8 5.5a15 15 0 0 1-2.4 3.1M5.1 6.2A14.6 14.6 0 0 0 2 10s3 5.5 8 5.5a7.7 7.7 0 0 0 3-.6" />
      <path d="m3 3 14 14" />
      <path d="M8.4 8.6a2.5 2.5 0 0 0 3.2 3.4" />
    </svg>
  );
}
