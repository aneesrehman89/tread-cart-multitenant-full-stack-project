'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Slide {
  title: string;
  body: string;
  /** Two colours for the slide's gradient panel. */
  from: string;
  to: string;
  art: 'tire' | 'wheel' | 'fitment';
}

/**
 * Splash carousel.
 *
 * Auto-advances, but stops the moment someone interacts — an auto-rotating
 * carousel that keeps moving under a reader's cursor is the classic
 * complaint. Also pauses when the tab is hidden and when the viewer prefers
 * reduced motion, and supports arrow keys and swipe.
 */
export function SplashSlider({
  slides,
  onDone,
  intervalMs = 5000,
}: {
  slides: Slide[];
  onDone: () => void;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  // Respect the OS "reduce motion" setting: no automatic movement at all.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, reducedMotion, slides.length, intervalMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setPaused(true);
        go(index + 1);
      }
      if (e.key === 'ArrowLeft') {
        setPaused(true);
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  const slide = slides[index]!;

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: `linear-gradient(150deg, ${slide.from}, ${slide.to})`, transition: 'background 600ms ease' }}
      onMouseEnter={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
      onTouchStart={(e) => {
        setPaused(true);
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        touchStartX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 text-xs font-bold text-white backdrop-blur">
            T
          </span>
          <span className="text-sm font-semibold text-white">TreadCart</span>
        </span>
        <button
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          Skip
        </button>
      </div>

      <div
        className="flex flex-1 items-center justify-center px-6 pb-10"
        role="region"
        aria-roledescription="carousel"
        aria-label="Welcome"
      >
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-10 h-44 w-44">
            <SlideArt kind={slide.art} />
          </div>

          {/* aria-live so screen readers hear each slide as it changes. */}
          <div aria-live="polite">
            <h1 key={`t${index}`} className="animate-[fadeUp_400ms_ease] text-3xl font-semibold leading-tight tracking-tight text-white">
              {slide.title}
            </h1>
            <p key={`b${index}`} className="mt-3 animate-[fadeUp_500ms_ease] text-sm leading-relaxed text-white/75">
              {slide.body}
            </p>
          </div>

          {/* Dots */}
          <div className="mt-10 flex items-center justify-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.title}
                onClick={() => {
                  setPaused(true);
                  go(i);
                }}
                aria-label={`Go to slide ${i + 1}: ${s.title}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? 'w-7 bg-white' : 'w-2 bg-white/35 hover:bg-white/60'
                }`}
              />
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-2.5">
            {index < slides.length - 1 ? (
              <button
                onClick={() => {
                  setPaused(true);
                  go(index + 1);
                }}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 transition-transform hover:scale-[1.02]"
              >
                Next
              </button>
            ) : (
              <button
                onClick={onDone}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink-900 transition-transform hover:scale-[1.02]"
              >
                Start shopping
              </button>
            )}
            <button
              onClick={onDone}
              className="rounded-full px-5 py-2.5 text-xs font-medium text-white/70 hover:text-white"
            >
              Browse the catalog
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Inline SVG art so the splash needs no image assets. */
function SlideArt({ kind }: { kind: Slide['art'] }) {
  if (kind === 'tire') {
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="rgba(255,255,255,0.10)" />
        <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.55)" strokeWidth="9" fill="none" />
        <circle cx="50" cy="50" r="24" stroke="rgba(255,255,255,0.85)" strokeWidth="4" fill="none" />
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 38}
              y1={50 + Math.sin(a) * 38}
              x2={50 + Math.cos(a) * 46}
              y2={50 + Math.sin(a) * 46}
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    );
  }

  if (kind === 'wheel') {
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.35)" strokeWidth="6" fill="rgba(255,255,255,0.08)" />
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return (
            <path
              key={i}
              d={`M50 50 L${50 + Math.cos(a - 0.22) * 36} ${50 + Math.sin(a - 0.22) * 36} L${50 + Math.cos(a + 0.22) * 36} ${50 + Math.sin(a + 0.22) * 36} Z`}
              fill="rgba(255,255,255,0.75)"
            />
          );
        })}
        <circle cx="50" cy="50" r="10" fill="rgba(255,255,255,0.95)" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <rect x="12" y="38" width="76" height="26" rx="8" fill="rgba(255,255,255,0.75)" />
      <path d="M24 38 L34 24 h32 l10 14" stroke="rgba(255,255,255,0.75)" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <circle cx="32" cy="66" r="11" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="5" />
      <circle cx="68" cy="66" r="11" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="5" />
    </svg>
  );
}
