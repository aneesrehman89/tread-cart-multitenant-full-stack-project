'use client';

import { useState } from 'react';

// Click-to-edit cell: Enter/blur saves, Escape reverts, failed save restores the original.
export function EditableText({
  value,
  onSave,
  placeholder,
  className = '',
  inputClassName = '',
  title = 'Click to edit',
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(false);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      setError(true);
      setDraft(value);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`group inline-flex items-center gap-1.5 text-left ${className}`}
      >
        <span>{value || <span className="text-ink-400">{placeholder ?? '—'}</span>}</span>
        <PencilIcon />
        {error && <span className="text-2xs text-red-600">save failed</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      disabled={busy}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commit();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`w-full rounded border border-brand-400 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 ${inputClassName}`}
    />
  );
}

function PencilIcon() {
  return (
    <svg
      className="h-3 w-3 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M13.5 3.5 16.5 6.5 7 16H4v-3l9.5-9.5Z" />
    </svg>
  );
}
