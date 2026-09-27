/**
 * Parses the size string a fitter actually types into the structured columns
 * the catalog filters on.
 *
 * Asking for section width, aspect ratio and rim diameter as three separate
 * numbers is how a database thinks, not how a tire shop does. One field that
 * understands "225/45R17" is both faster to fill and harder to get wrong,
 * and the parsed parts still drive the fitment filters.
 */

export interface TireSize {
  sectionWidthMm: number;
  aspectRatio: number;
  rimDiameterIn: number;
}

export interface WheelSize {
  rimDiameterIn: number;
  wheelWidthIn: number;
  boltPattern: string | null;
  offsetMm: number | null;
}

/** Accepts 225/45R17, 225/45 R17, 225/45ZR17, 225/45-17. */
export function parseTireSize(input: string): TireSize | null {
  const m = input
    .trim()
    .toUpperCase()
    .match(/^(\d{3})\s*\/\s*(\d{2})\s*(?:Z?R|-)\s*(\d{2}(?:\.\d)?)$/);
  if (!m) return null;

  const sectionWidthMm = Number(m[1]);
  const aspectRatio = Number(m[2]);
  const rimDiameterIn = Math.round(Number(m[3]));

  // Guard against plausible-looking nonsense such as 999/99R99.
  if (sectionWidthMm < 115 || sectionWidthMm > 405) return null;
  if (aspectRatio < 20 || aspectRatio > 90) return null;
  if (rimDiameterIn < 10 || rimDiameterIn > 26) return null;

  return { sectionWidthMm, aspectRatio, rimDiameterIn };
}

/**
 * Accepts 18x8.5, 18x8.5 5x114.3, 18x8.5 5x114.3 ET35, and ET-12 for a
 * negative offset.
 */
export function parseWheelSize(input: string): WheelSize | null {
  const cleaned = input.trim().toUpperCase().replace(/×/g, 'X');

  const size = cleaned.match(/^(\d{2}(?:\.\d)?)\s*X\s*(\d{1,2}(?:\.\d)?)/);
  if (!size) return null;

  const rimDiameterIn = Math.round(Number(size[1]));
  const wheelWidthIn = Number(size[2]);
  if (rimDiameterIn < 12 || rimDiameterIn > 30) return null;
  if (wheelWidthIn < 4 || wheelWidthIn > 16) return null;

  // Bolt pattern: the SECOND NxN in the string, so it is never confused with
  // the leading diameter x width.
  const rest = cleaned.slice(size[0].length);
  const bolt = rest.match(/(\d)\s*X\s*(\d{2,3}(?:\.\d)?)/);
  const offset = rest.match(/ET\s*(-?\d{1,3})/);

  return {
    rimDiameterIn,
    wheelWidthIn,
    boltPattern: bolt ? `${bolt[1]}x${bolt[2]}` : null,
    offsetMm: offset ? Number(offset[1]) : null,
  };
}

/** Human-readable explanation of what a size string was understood to mean. */
export function describeSize(type: string, input: string): string | null {
  if (!input.trim()) return null;

  if (type === 'TIRE') {
    const t = parseTireSize(input);
    return t
      ? `${t.sectionWidthMm} mm wide · ${t.aspectRatio}% profile · ${t.rimDiameterIn}" rim`
      : null;
  }

  const w = parseWheelSize(input);
  if (!w) return null;
  const parts = [`${w.rimDiameterIn}" × ${w.wheelWidthIn}"`];
  if (w.boltPattern) parts.push(`${w.boltPattern} PCD`);
  if (w.offsetMm !== null) parts.push(`ET${w.offsetMm}`);
  return parts.join(' · ');
}

/** Suggests a SKU code from the brand and size, so nobody invents one. */
export function suggestSkuCode(brand: string, size: string): string {
  const prefix = brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const suffix = size.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return prefix && suffix ? `${prefix}-${suffix}` : '';
}
