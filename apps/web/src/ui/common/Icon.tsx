/**
 * Functional icons (art-direction §2: consistent code-native SVG, never generated art). One 24-unit grid, round
 * 2-unit strokes in the current text colour, so an icon takes its tone from the class around it. Decorative: the
 * label next to an icon carries the meaning.
 */
import type { ActionKind } from '@fastlane/content/keys';

const PATHS = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  heart: (
    <path d="M12 20s-7-4.4-8.6-9A4.6 4.6 0 0 1 12 6.6 4.6 4.6 0 0 1 20.6 11C19 15.6 12 20 12 20z" />
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14a5.5 5.5 0 0 1 3 6" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  meal: <path d="M4 11h16a8 8 0 0 1-16 0zM9 3v5M12 3v5M15 3v5M7 21h10" />,
  bed: <path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5h.01" />,
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  bowl: <path d="M3 12h18a9 9 0 0 1-18 0zM8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4M18 3l-6 9" />,
  basket: <path d="M3 9h18l-2 11H5zM8 9l3-6M16 9l-3-6M9 13v3M15 13v3" />,
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="10" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 11h6M9 15h4" />
    </>
  ),
  book: (
    <path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5zM12 6v14" />
  ),
  bag: <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />,
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="M11 11l9-9M16 6l3 3M14 8l2 2" />
    </>
  ),
  repeat: <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5" />
    </>
  ),
  bank: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />,
  scooter: (
    <>
      <circle cx="5.5" cy="17.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M8 17.5h7l3-11h3M14 6.5h4" />
    </>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  home: <path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" />,
  store: (
    <path d="M3 9l2-5h14l2 5M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8M10 20v-5h4v5" />
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  exit: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className = '',
  fill = 'none',
  weight = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** A colour inside the strokes, for the bolder pictograms of action rows. */
  fill?: string;
  weight?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}

/** What an action is about, for its icon and its tile's tint. */
type Family = 'rest' | 'food' | 'social' | 'work' | 'study' | 'shop' | 'money' | 'home';

/** Tile tints per family: light washes of the palette, under ink icons. */
export const FAMILY_TILE: Record<Family, string> = {
  rest: 'bg-sky/45 text-ink dark:text-cream',
  food: 'bg-butter text-ink dark:bg-gold/30 dark:text-cream',
  social: 'bg-brick/25 text-ink dark:text-cream',
  work: 'bg-teal/30 text-ink dark:text-cream',
  study: 'bg-lilac/35 text-ink dark:text-cream',
  shop: 'bg-leaf/30 text-ink dark:text-cream',
  money: 'bg-gold/45 text-ink dark:text-cream',
  home: 'bg-slate/30 text-ink dark:text-cream',
};

/** The colour inside an action's pictogram, so the tile reads as an illustration rather than a line icon. */
export const FAMILY_FILL: Record<Family, string> = {
  rest: 'var(--color-sky)',
  food: 'var(--color-gold)',
  social: 'var(--color-brick)',
  work: 'var(--color-teal)',
  study: 'var(--color-lilac)',
  shop: 'var(--color-leaf)',
  money: 'var(--color-gold)',
  home: 'var(--color-cream)',
};

const BY_KIND: Record<ActionKind, [IconName, Family]> = {
  basic: ['star', 'rest'],
  eat: ['bowl', 'food'],
  'eat-stored': ['basket', 'food'],
  'work-shift': ['briefcase', 'work'],
  gig: ['scooter', 'work'],
  'apply-job': ['clipboard', 'work'],
  enroll: ['book', 'study'],
  'drop-course': ['book', 'study'],
  study: ['book', 'study'],
  buy: ['bag', 'shop'],
  'rent-home': ['key', 'home'],
  subscribe: ['repeat', 'shop'],
  unsubscribe: ['repeat', 'shop'],
  'subscription-audit': ['repeat', 'shop'],
  deposit: ['coin', 'money'],
  withdraw: ['coin', 'money'],
  borrow: ['bank', 'money'],
  repay: ['bank', 'money'],
};

/** Basic actions say little by kind, so the common ones get their own picture. */
const BY_ID: Record<string, [IconName, Family]> = {
  nap: ['bed', 'rest'],
  'binge-stream': ['tv', 'rest'],
  'host-friends': ['users', 'social'],
  'hang-out': ['users', 'social'],
  wfh: ['laptop', 'work'],
};

export function actionIcon(actionId: string, kind: ActionKind | undefined): [IconName, Family] {
  return BY_ID[actionId] ?? (kind ? BY_KIND[kind] : ['star', 'rest']);
}
