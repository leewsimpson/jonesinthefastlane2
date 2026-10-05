import { z } from 'zod';
import { ACTION_TAGS, STAT_KEYS } from './keys.ts';

export * from './keys.ts';

/** Top-level content manifest. Later phases add schemas for jobs, items and events (FR-74, NFR-15). */
export const MetaSchema = z.object({
  contentVersion: z.number().int().positive(),
  defaultCity: z.string().min(1),
});

export type Meta = z.infer<typeof MetaSchema>;

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case');

export const StatKeySchema = z.enum(STAT_KEYS);

const StatRange = z
  .object({ min: z.number(), max: z.number().nullable() })
  .refine((r) => r.max === null || r.min <= r.max, 'min must be ≤ max');

const StatDeltas = z.partialRecord(StatKeySchema, z.number());

/** Hours are whole quarter-hours, so time arithmetic stays exact in floating point. */
const Hours = z
  .number()
  .nonnegative()
  .refine((h) => Number.isInteger(h * 4), 'use quarter-hours');

/** Global balance constants (NFR-15). City-specific prices live in the city profile (FR-33). */
export const BalanceSchema = z
  .object({
    /** Discretionary waking hours per week (FR-01). */
    weekHours: Hours.refine((h) => h > 0, 'must be positive'),
    /** Inclusive range for every stat. `max: null` means unbounded (cash). */
    statRanges: z.record(StatKeySchema, StatRange),
    startingStats: z.record(StatKeySchema, z.number()),
    /** Names of the dress tiers, lowest first. The wardrobe stat is an index into this list. */
    wardrobeTiers: z.array(z.string().min(1)).min(1),
    /** Energy gained per unspent hour when the week ends (FR-04). */
    restBonusEnergyPerHour: z.number().nonnegative(),
    /** Low energy makes output actions less effective (FR-21). */
    lowEnergy: z.object({
      threshold: z.number(),
      outputMultiplier: z.number().min(0).max(1),
    }),
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

/** A travel mode (FR-02). Cost grows with the number of steps around the loop. */
export const TransportModeSchema = z.object({
  id: Id,
  name: z.string().min(1),
  hoursBase: Hours,
  hoursPerStep: Hours,
  costBase: z.number().nonnegative(),
  costPerStep: z.number().nonnegative(),
  energyPerStep: z.number().nonnegative(),
  /** Item the player must own to use this mode (items arrive in Phase 2). */
  requiresItem: Id.optional(),
});

export type TransportMode = z.infer<typeof TransportModeSchema>;

export const LocationSchema = z.object({
  id: Id,
  name: z.string().min(1),
});

export type Location = z.infer<typeof LocationSchema>;

/** The board is a loop: travel distance is the shorter way round (FR-30). */
export const BoardSchema = z.object({
  /** Locations in loop order. */
  locations: z.array(LocationSchema).min(2),
  /** Where each player starts the week. */
  home: Id,
  transportModes: z.array(TransportModeSchema).min(1),
});

export type Board = z.infer<typeof BoardSchema>;

/** A stat change: a fixed amount or a range rolled on the `actions` stream (preview shows the range). */
export const EffectSchema = z.union([
  z.number(),
  z
    .object({ min: z.number(), max: z.number() })
    .refine((r) => Number.isInteger(r.min) && Number.isInteger(r.max) && r.min <= r.max, {
      message: 'ranges are integers with min ≤ max',
    }),
]);

export type Effect = z.infer<typeof EffectSchema>;

/** Something a player can do at a location (FR-03). */
export const LocationActionSchema = z.object({
  id: Id,
  location: Id,
  name: z.string().min(1),
  hours: Hours.refine((h) => h > 0, 'must be positive'),
  /** Paid up front; the action is blocked if the player can't afford it. */
  cost: z.number().nonnegative(),
  /** Stat changes on completion. A positive `cash` effect is money earned. */
  effects: z.partialRecord(StatKeySchema, EffectSchema),
  /** `eat` satisfies the food check. `output` gains are scaled by modifiers such as low energy. */
  tags: z.array(z.enum(ACTION_TAGS)).default([]),
});

export type LocationAction = z.infer<typeof LocationActionSchema>;

/** Everything city-specific (FR-33). */
export const CitySchema = z.object({
  id: Id,
  name: z.string().min(1),
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

  if (!locationIds.includes(board.home)) problems.push(`home "${board.home}" is not a location`);
  if (!board.transportModes.some((m) => !m.requiresItem))
    problems.push('at least one transport mode must need no item');
  for (const a of actions) {
    if (!locationIds.includes(a.location))
      problems.push(`action "${a.id}" is at unknown location "${a.location}"`);
    if (a.hours > content.balance.weekHours)
      problems.push(`action "${a.id}" takes longer than a week`);
  }
  return problems;
}
