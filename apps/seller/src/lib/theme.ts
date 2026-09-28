// Stores control colour, font and control style via CSS variables; layout and type scale stay fixed.

export interface StoreTheme {
  brandPrimary: string;
  brandAccent: string;
  fontFamily: string;
  buttonStyle: string;
  buttonWeight: string;
  cardStyle: string;
}

export const FONTS: Record<string, { label: string; stack: string; google?: string }> = {
  inter: { label: 'Inter', stack: "'Inter', ui-sans-serif, system-ui, sans-serif", google: 'Inter:wght@400;500;600;700' },
  'dm-sans': { label: 'DM Sans', stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif", google: 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700' },
  manrope: { label: 'Manrope', stack: "'Manrope', ui-sans-serif, system-ui, sans-serif", google: 'Manrope:wght@400;500;600;700' },
  'source-serif': { label: 'Source Serif', stack: "'Source Serif 4', ui-serif, Georgia, serif", google: 'Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700' },
  'space-grotesk': { label: 'Space Grotesk', stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", google: 'Space+Grotesk:wght@400;500;600;700' },
};

export const BUTTON_RADII: Record<string, string> = {
  rounded: '0.5rem',
  pill: '9999px',
  square: '0.125rem',
};

export const CARD_RADII: Record<string, string> = {
  soft: '12px',
  flat: '4px',
  bordered: '8px',
};

const LOADED_FONTS = new Set<string>();

/** Adds a Google Fonts stylesheet once per typeface, on demand. */
function loadFont(key: string): void {
  const font = FONTS[key];
  if (!font?.google || LOADED_FONTS.has(key) || typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
  LOADED_FONTS.add(key);
}

/** Readable text colour for a given background, by perceived luminance. */
export function contrastOn(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#FFFFFF';
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Rec. 709 luma: green dominates perceived brightness.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.6 ? '#141A15' : '#FFFFFF';
}

/** Mixes a hex colour towards black or white. */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const to = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (to - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function applyStoreTheme(theme: Partial<StoreTheme>): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement.style;
  const primary = theme.brandPrimary ?? '#0F5132';
  const accent = theme.brandAccent ?? '#84CC16';

  root.setProperty('--store-brand', primary);
  root.setProperty('--store-brand-dark', shade(primary, -0.35));
  root.setProperty('--store-brand-deep', shade(primary, -0.6));
  root.setProperty('--store-brand-soft', shade(primary, 0.88));
  root.setProperty('--store-on-brand', contrastOn(primary));
  root.setProperty('--store-accent', accent);
  root.setProperty('--store-on-accent', contrastOn(accent));

  const fontKey = theme.fontFamily ?? 'inter';
  loadFont(fontKey);
  root.setProperty('--store-font', FONTS[fontKey]?.stack ?? FONTS.inter!.stack);

  root.setProperty('--btn-radius', BUTTON_RADII[theme.buttonStyle ?? 'rounded'] ?? BUTTON_RADII.rounded!);
  root.setProperty('--card-radius', CARD_RADII[theme.cardStyle ?? 'soft'] ?? CARD_RADII.soft!);

  // Button weight decides fill vs tint vs outline.
  const weight = theme.buttonWeight ?? 'solid';
  root.setProperty('--btn-bg', weight === 'solid' ? primary : weight === 'soft' ? shade(primary, 0.88) : 'transparent');
  root.setProperty('--btn-fg', weight === 'solid' ? contrastOn(primary) : primary);
  root.setProperty('--btn-border', weight === 'outline' ? primary : 'transparent');
}
