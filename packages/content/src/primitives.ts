/** Shared schema building blocks: ids, units (engine-design §5) and stat effects. */
import { z } from 'zod';
import { STAT_KEYS } from './keys.ts';

export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case');

export const StatKeySchema = z.enum(STAT_KEYS);

/** Integer minutes in whole quarter-hours (engine-design §5). */
export const Minutes = z
  .number()
  .int()
  .nonnegative()
  .refine((m) => m % 15 === 0, 'use multiples of 15 minutes');
export const PositiveMinutes = Minutes.refine((m) => m > 0, 'must be positive');

/** Integer cents (engine-design §5). */
export const Cents = z.number().int().nonnegative();

/** Integer basis points; 10 000 is 100% (engine-design §5). */
export const Bp = z.number().int();
export const Chance = Bp.min(0).max(10_000);
/** A change in basis points; nothing can lose more than all of itself. */
export const BpChange = Bp.min(-10_000);
export const BpRange = z
  .object({ min: BpChange, max: BpChange })
  .refine((r) => r.min <= r.max, 'min must be ≤ max');
export const IntRange = z
  .object({ min: z.number().int(), max: z.number().int() })
  .refine((r) => r.min <= r.max, 'min must be ≤ max');

export const StatRange = z
  .object({ min: z.number().int(), max: z.number().int().nullable() })
  .refine((r) => r.max === null || r.min <= r.max, 'min must be ≤ max');

export const StatDeltas = z.partialRecord(StatKeySchema, z.number().int());

/** A stat change: a fixed amount or a range rolled on the `action` stream (preview shows the range). */
export const EffectSchema = z.union([
  z.number().int(),
  z
    .object({ min: z.number().int(), max: z.number().int() })
    .refine((r) => r.min <= r.max, { message: 'ranges need min ≤ max' }),
]);

export type Effect = z.infer<typeof EffectSchema>;

/**
 * Stat changes, fixed or rolled. A `cash` effect is money earned and can't be negative: costs are paid up front
 * and checked against cash, so cash never goes below 0 (engine-design §10).
 */
export const EffectsSchema = z
  .partialRecord(StatKeySchema, EffectSchema)
  .refine(
    (e) => e.cash === undefined || (typeof e.cash === 'number' ? e.cash : e.cash.min) >= 0,
    'a cash effect is earnings; put costs in `cost`',
  );
