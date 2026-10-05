import { z } from 'zod';
import { ACTION_KINDS, MODIFIER_TARGETS, STAT_KEYS } from './keys.ts';

export * from './keys.ts';

/** Top-level content manifest. Later phases add schemas for jobs, items and events (FR-74, NFR-15). */
export const MetaSchema = z.object({
  contentVersion: z.number().int().positive(),
  defaultCity: z.string().min(1),
});

export type Meta = z.infer<typeof MetaSchema>;

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case');

export const StatKeySchema = z.enum(STAT_KEYS);

/** Integer minutes in whole quarter-hours (engine-design §5, §17 open question 1). */
const Minutes = z
  .number()
  .int()
  .nonnegative()
  .refine((m) => m % 15 === 0, 'use multiples of 15 minutes');

/** Integer cents (engine-design §5). */
const Cents = z.number().int().nonnegative();

const StatRange = z
  .object({ min: z.number().int(), max: z.number().int().nullable() })
  .refine((r) => r.max === null || r.min <= r.max, 'min must be ≤ max');

const StatDeltas = z.partialRecord(StatKeySchema, z.number().int());

/** A stat threshold that scales a target quantity while the stat is below it (FR-21), e.g. low energy. */
export const StatModifierSchema = z.object({
  /** Also the copy key suffix: `modifier.<id>`. */
  id: Id,
  stat: StatKeySchema,
  below: z.number().int(),
  target: z.enum(MODIFIER_TARGETS),
  /** Basis points added to ×1 (10 000). −2000 is −20%. */
  bp: z.number().int().min(-10_000),
});

export type StatModifier = z.infer<typeof StatModifierSchema>;

/** Global balance constants (NFR-15). City-specific prices live in the city profile (FR-33). */
export const BalanceSchema = z
  .object({
    /** Discretionary waking minutes per week (FR-01). */
    weekMinutes: Minutes.refine((m) => m > 0, 'must be positive'),
    /** Inclusive range for every stat. `max: null` means unbounded (cash). Cash is in cents. */
    statRanges: z.record(StatKeySchema, StatRange),
    startingStats: z.record(StatKeySchema, z.number().int()),
    /** Dress tier ids, lowest first. The wardrobe stat is an index into this list. */
    wardrobeTiers: z.array(Id).min(1),
    /** Energy gained per unspent hour when the week ends (FR-04). Rounded down. */
    restBonusEnergyPerHour: z.number().int().nonnegative(),
    /** Checked in this order; the UI lists them in this order (FR-21). */
    statModifiers: z.array(StatModifierSchema),
    /** Applied by the food check when the player didn't eat during the week (§4 Hunger). */
    hungerPenalty: StatDeltas,
    /** Weekly sleep recovery and stat decay, applied after the food check (FR-05). */
    weeklyDrift: StatDeltas,
  })
  .superRefine((b, ctx) => {
    for (const key of STAT_KEYS) {
      const range = b.statRanges[key];
      const start = b.startingStats[key];
      if (start < range.min || (range.max !== null && start > range.max)) {
        ctx.addIssue({
          code: 'custom',
          path: ['startingStats', key],
          message: `starting ${key} is outside its range`,
        });
      }
    }
    if (b.statRanges.wardrobe.max !== b.wardrobeTiers.length - 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['statRanges', 'wardrobe'],
        message: 'wardrobe max must be the last wardrobe tier index',
      });
    }
  });

export type Balance = z.infer<typeof BalanceSchema>;

/** A travel mode (FR-02). Time, money and energy grow with the distance around the loop. */
export const TransportModeSchema = z.object({
  id: Id,
  minutesBase: Minutes,
  minutesPerStep: Minutes,
  costBase: Cents,
  costPerStep: Cents,
  energyPerStep: z.number().int().nonnegative(),
  /** Item the player must own to use this mode (items arrive in Phase 2). */
  requiresItem: Id.optional(),
});

export type TransportMode = z.infer<typeof TransportModeSchema>;

export const LocationSchema = z.object({
  id: Id,
});

export type Location = z.infer<typeof LocationSchema>;

/** The board is a loop: travel distance is the shorter way round (FR-30). */
export const BoardSchema = z.object({
  /** Locations in loop order. */
  locations: z.array(LocationSchema).min(2),
  /** `segments[i]` is the distance from `locations[i]` to the next one, wrapping round. */
  segments: z.array(z.number().int().positive()),
  /** Where each player starts the week. */
  home: Id,
  transportModes: z.array(TransportModeSchema).min(1),
});

export type Board = z.infer<typeof BoardSchema>;

/** A stat change: a fixed amount or a range rolled on the `action` stream (preview shows the range). */
export const EffectSchema = z.union([
  z.number().int(),
  z
    .object({ min: z.number().int(), max: z.number().int() })
    .refine((r) => r.min <= r.max, { message: 'ranges need min ≤ max' }),
]);

export type Effect = z.infer<typeof EffectSchema>;

/** Something a player can do at a location (FR-03). Its label is the copy key `action.<id>`. */
export const LocationActionSchema = z.object({
  id: Id,
  location: Id,
  /** The engine handler that runs it (engine-design §8.2). */
  kind: z.enum(ACTION_KINDS),
  minutes: Minutes.refine((m) => m > 0, 'must be positive'),
  /** Paid up front; the action is unavailable if the player can't afford it. */
  cost: Cents,
  /** Stat changes on completion. A positive `cash` effect is money earned. */
  effects: z.partialRecord(StatKeySchema, EffectSchema),
  /** Positive effects are scaled by modifiers on this target (e.g. low energy on `workOutput`). */
  outputTarget: z.enum(MODIFIER_TARGETS).optional(),
});

export type LocationAction = z.infer<typeof LocationActionSchema>;

/** Everything city-specific (FR-33). Its name is the copy key `city.<id>`. */
export const CitySchema = z.object({
  id: Id,
  board: BoardSchema,
  actions: z.array(LocationActionSchema),
});

export type City = z.infer<typeof CitySchema>;

/** The resolved content the engine runs against. */
export interface GameContent {
  meta: Meta;
  balance: Balance;
  city: City;
}

/** UI copy, keyed by string key (NFR-06). Content holds ids; copy lives in `locales/<lang>.json`. */
export const StringsSchema = z.record(z.string(), z.string().min(1));

export type Strings = z.infer<typeof StringsSchema>;

/** Cross-file and cross-reference checks that a single schema can't express. Returns problems found. */
export function checkContent(content: GameContent): string[] {
  const problems: string[] = [];
  const { board, actions } = content.city;
  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

  const locationIds = board.locations.map((l) => l.id);
  for (const id of dupes(locationIds)) problems.push(`duplicate location id "${id}"`);
  for (const id of dupes(board.transportModes.map((m) => m.id)))
    problems.push(`duplicate transport mode id "${id}"`);
  for (const id of dupes(actions.map((a) => a.id))) problems.push(`duplicate action id "${id}"`);
  for (const id of dupes(content.balance.statModifiers.map((m) => m.id)))
    problems.push(`duplicate stat modifier id "${id}"`);

  if (board.segments.length !== locationIds.length)
    problems.push('the board needs one segment per location');
  if (!locationIds.includes(board.home)) problems.push(`home "${board.home}" is not a location`);
  if (!board.transportModes.some((m) => !m.requiresItem))
    problems.push('at least one transport mode must need no item');
  for (const a of actions) {
    if (!locationIds.includes(a.location))
      problems.push(`action "${a.id}" is at unknown location "${a.location}"`);
    if (a.minutes > content.balance.weekMinutes)
      problems.push(`action "${a.id}" takes longer than a week`);
  }
  return problems;
}

/** Every copy key the content refers to (NFR-06). */
export function contentStringKeys(content: GameContent): string[] {
  const { city, balance } = content;
  return [
    `city.${city.id}`,
    ...city.board.locations.map((l) => `location.${l.id}`),
    ...city.board.transportModes.map((m) => `transport.${m.id}`),
    ...city.actions.map((a) => `action.${a.id}`),
    ...balance.wardrobeTiers.map((t) => `wardrobe.${t}`),
    ...balance.statModifiers.map((m) => `modifier.${m.id}`),
  ];
}

/** Copy keys the content needs but the strings file lacks. */
export function checkStrings(content: GameContent, strings: Strings): string[] {
  return contentStringKeys(content)
    .filter((key) => strings[key] === undefined)
    .map((key) => `missing string "${key}"`);
}
