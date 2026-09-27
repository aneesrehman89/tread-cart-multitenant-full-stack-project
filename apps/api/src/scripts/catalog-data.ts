/**
 * Demo catalog.
 *
 * Photography is hotlinked from Unsplash (free licence, no attribution
 * required) rather than uploaded to S3, so the seed needs no bucket and no
 * binaries in the repo. Real stores upload their own, which is why
 * ProductImage carries either an `s3Key` or a `url`.
 */

const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=70&auto=format&fit=crop`;

export const TIRE_IMAGES = [
  IMG('1656232976683-7b688560e427'),
  IMG('1685270387102-5c0fccf96ad9'),
  IMG('1684329602199-0276ef362643'),
  IMG('1694787683490-0b9dff60d8ab'),
  IMG('1651358910062-5939b549883d'),
];

export const WHEEL_IMAGES = [
  IMG('1741366175071-3604c86ec475'),
  IMG('1738260491334-92218e3a397e'),
  IMG('1768341396286-a6322d588111'),
  IMG('1601046885216-e2159d7a24de'),
  IMG('1738260491334-92218e3a397e'),
];

export type SpeedRating = 'H' | 'V' | 'W' | 'Y' | 'T';
export type Season = 'ALL_SEASON' | 'SUMMER' | 'WINTER' | 'ALL_TERRAIN' | 'MUD_TERRAIN';

export interface TireSpec {
  brand: string;
  model: string;
  size: string;
  width: number;
  ratio: number;
  rim: number;
  loadIndex: number;
  speed: SpeedRating;
  season: Season;
  treadwear: number;
  priceCents: number;
  compareAtCents: number;
  /** onHand / reorderAt are chosen to give a realistic spread of stock states. */
  onHand: number;
  reorderAt: number;
  description: string;
}

/** Five tire brands, as requested. */
export const TIRES: TireSpec[] = [
  {
    brand: 'Achilles',
    model: 'ATR Sport 2',
    size: '225/45R17',
    width: 225,
    ratio: 45,
    rim: 17,
    loadIndex: 94,
    speed: 'W',
    season: 'SUMMER',
    treadwear: 320,
    priceCents: 12900,
    compareAtCents: 15500,
    onHand: 46,
    reorderAt: 10,
    description:
      'Ultra-high-performance summer tire with an asymmetric tread and a stiff outer shoulder for sharp turn-in. Suited to warm, dry roads.',
  },
  {
    brand: 'Apollo',
    model: 'Alnac 4G',
    size: '205/55R16',
    width: 205,
    ratio: 55,
    rim: 16,
    loadIndex: 91,
    speed: 'V',
    season: 'ALL_SEASON',
    treadwear: 480,
    priceCents: 9800,
    compareAtCents: 11200,
    onHand: 8,
    reorderAt: 12,
    description:
      'All-season touring tire built for low rolling resistance and quiet running. The go-to fitment for hatchbacks and compact sedans.',
  },
  {
    brand: 'Atturo',
    model: 'Trail Blade X/T',
    size: '265/70R17',
    width: 265,
    ratio: 70,
    rim: 17,
    loadIndex: 115,
    speed: 'T',
    season: 'ALL_TERRAIN',
    treadwear: 500,
    priceCents: 21500,
    compareAtCents: 24900,
    onHand: 0,
    reorderAt: 6,
    description:
      'Hybrid all-terrain with staggered shoulder blocks. Bites in mud and gravel without the road roar of a full mud-terrain.',
  },
  {
    brand: 'Blackhawk',
    model: 'Street-H HH11',
    size: '235/40R18',
    width: 235,
    ratio: 40,
    rim: 18,
    loadIndex: 95,
    speed: 'Y',
    season: 'SUMMER',
    treadwear: 300,
    priceCents: 14200,
    compareAtCents: 16800,
    onHand: 24,
    reorderAt: 8,
    description:
      'Performance summer tire with four wide circumferential grooves for wet grip at speed. Y-rated to 300 km/h.',
  },
  {
    brand: 'Hercules',
    model: 'Roadtour Connect PCV',
    size: '215/60R16',
    width: 215,
    ratio: 60,
    rim: 16,
    loadIndex: 95,
    speed: 'H',
    season: 'ALL_SEASON',
    treadwear: 620,
    priceCents: 11400,
    compareAtCents: 13000,
    onHand: 5,
    reorderAt: 10,
    description:
      'Long-wearing all-season with a 620 treadwear rating. Built for fleet mileage and predictable wet braking.',
  },
];

export interface WheelSpec {
  brand: string;
  model: string;
  size: string;
  rim: number;
  widthIn: number;
  boltPattern: string;
  offsetMm: number;
  centerBoreMm: number;
  finish: string;
  priceCents: number;
  compareAtCents: number;
  onHand: number;
  reorderAt: number;
  weightGrams: number;
  description: string;
}

/** Five wheel brands, as requested. */
export const WHEELS: WheelSpec[] = [
  {
    brand: 'American Force',
    model: 'Trax SS',
    size: '20x9',
    rim: 20,
    widthIn: 9,
    boltPattern: '6x139.7',
    offsetMm: 0,
    centerBoreMm: 78.1,
    finish: 'Polished',
    priceCents: 64900,
    compareAtCents: 72000,
    onHand: 12,
    reorderAt: 4,
    weightGrams: 15800,
    description:
      'Forged one-piece truck wheel, CNC-cut from 6061-T6 billet aluminium. Zero offset for a squared-off stance.',
  },
  {
    brand: 'Avant Garde',
    model: 'M632',
    size: '19x8.5',
    rim: 19,
    widthIn: 8.5,
    boltPattern: '5x112',
    offsetMm: 35,
    centerBoreMm: 66.6,
    finish: 'Satin Black',
    priceCents: 48500,
    compareAtCents: 55000,
    onHand: 3,
    reorderAt: 6,
    weightGrams: 11200,
    description:
      'Flow-formed concave monoblock. Light enough for track days, strong enough for daily use on German saloons.',
  },
  {
    brand: 'Black Rhino',
    model: 'Armory',
    size: '17x9.5',
    rim: 17,
    widthIn: 9.5,
    boltPattern: '5x127',
    offsetMm: -18,
    centerBoreMm: 71.6,
    finish: 'Gunblack',
    priceCents: 32900,
    compareAtCents: 37500,
    onHand: 28,
    reorderAt: 8,
    weightGrams: 13400,
    description:
      'Off-road wheel with a deep negative offset and a simulated beadlock lip. Hub-centric and load-rated for overlanding.',
  },
  {
    brand: 'Lexani',
    model: 'Ghost',
    size: '22x9',
    rim: 22,
    widthIn: 9,
    boltPattern: '5x114.3',
    offsetMm: 25,
    centerBoreMm: 74.1,
    finish: 'Gloss Black Machined',
    priceCents: 71900,
    compareAtCents: 82000,
    onHand: 0,
    reorderAt: 3,
    weightGrams: 16900,
    description:
      'Directional split-spoke in 22 inches, machined face over gloss black. Built for full-size SUVs and luxury sedans.',
  },
  {
    brand: 'Rohana',
    model: 'RFX11',
    size: '20x10',
    rim: 20,
    widthIn: 10,
    boltPattern: '5x120',
    offsetMm: 40,
    centerBoreMm: 72.6,
    finish: 'Brushed Titanium',
    priceCents: 58900,
    compareAtCents: 66000,
    onHand: 16,
    reorderAt: 5,
    weightGrams: 12600,
    description:
      'Rotary-forged split five-spoke with a brushed titanium finish. A staggered-friendly fitment for rear-drive coupes.',
  },
];

/** Vehicles used to demonstrate fitment lookups. */
export const VEHICLES = [
  { year: 2021, make: 'Honda', model: 'Civic', trim: 'Sport' },
  { year: 2022, make: 'Toyota', model: 'Corolla', trim: 'Altis' },
  { year: 2020, make: 'Suzuki', model: 'Swift', trim: 'GLX' },
  { year: 2023, make: 'Ford', model: 'F-150', trim: 'XLT' },
  { year: 2022, make: 'BMW', model: '3 Series', trim: '330i' },
];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
