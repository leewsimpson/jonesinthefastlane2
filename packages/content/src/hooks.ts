/**
 * Schemas for the "one more week" machinery (FR-70–FR-74, ENG-10–ENG-14): weekend events, news, micro-goals and the
 * AI rival's personas. Copy lives in `locales/` (FR-84); these files hold ids, conditions, weights and effects.
 */
import { z } from 'zod';
import { DIFFICULTIES, EVENT_CATEGORIES, GOAL_KEYS } from './keys.ts';
import {
  Bp,
  Cents,
  Chance,
  EffectsSchema,
  Id,
  IntRange,
  Minutes,
  StatDeltas,
  StatKeySchema,
} from './primitives.ts';

const Weight = z.number().int().positive();
const Bound = z
  .object({ min: z.number().int().optional(), max: z.number().int().optional() })
  .refine((b) => b.min === undefined || b.max === undefined || b.min <= b.max, 'min must be ≤ max');

/**
 * When an event, choice or quest applies to a player. Every field is optional and they all have to hold. `housing`
 * lists tiers the player may live in; `items` must all be owned and `notItems` none.
 */
export const ConditionSchema = z.object({
  minWeek: z.number().int().positive().optional(),
  maxWeek: z.number().int().positive().optional(),
  stats: z.partialRecord(StatKeySchema, Bound).optional(),
  job: z.boolean().optional(),
  housing: z.array(Id).min(1).optional(),
  items: z.array(Id).min(1).optional(),
  notItems: z.array(Id).min(1).optional(),
  /** Owes anything (card, student loan or arrears). */
  debt: z.boolean().optional(),
  enrolled: z.boolean().optional(),
  /** Holds any market asset (index fund, crypto, …). */
  invested: z.boolean().optional(),
  subscribed: z.boolean().optional(),
});

export type Condition = z.infer<typeof ConditionSchema>;

/** One option on a weekend event card. Copy key: `event.<event>.<choice>`. */
export const EventChoiceSchema = z.object({
  id: Id,
  /** Paid up front; the choice is only offered when cash covers it. */
  cost: Cents.default(0),
  /** Rolled on the player's `events` stream. Cash effects are winnings. */
  effects: EffectsSchema.default({}),
  /** Minutes added to (or taken from) next week's time budget: a sick day, a free afternoon. */
  nextWeekMinutes: z
    .number()
    .int()
    .refine((m) => m % 15 === 0, 'use multiples of 15 minutes')
    .default(0),
  /** Change to the job rating (FR-43). Only for events that need a job. */
  jobRating: z.number().int().default(0),
  /** A layoff lands at the next job check (FR-42). */
  layoffWarning: z.boolean().default(false),
  /** Weeks banned from GigHub (FR-44). */
  gigBanWeeks: z.number().int().nonnegative().default(0),
  /** Only offered when this holds, e.g. owning the item the choice uses. */
  when: ConditionSchema.optional(),
});

export type EventChoice = z.infer<typeof EventChoiceSchema>;

/**
 * A weekend event card (FR-70, FR-71, FR-74). Copy keys: `event.<id>` (title), `event.<id>.text` (the card) and
 * `event.<id>.<choice>` per option. One choice means no decision: it applies straight away.
 */
export const WeekendEventSchema = z.object({
  id: Id,
  category: z.enum(EVENT_CATEGORIES),
  weight: Weight,
  when: ConditionSchema.optional(),
  /** Weeks before the same card can come up again for this player. Defaults to `balance.events.cooldownWeeks`. */
  cooldownWeeks: z.number().int().nonnegative().optional(),
  /** `burnout` cards are drawn, instead of the deck, after a week that ended at 0 Energy (§4 Energy). */
  trigger: z.literal('burnout').optional(),
  choices: z.array(EventChoiceSchema).min(1).max(3),
});

export type WeekendEvent = z.infer<typeof WeekendEventSchema>;

/**
 * What a news story changes while it runs (FR-72). Each is added to the usual value; several stories stack.
 * Exposure changes the AI-disruption roll for jobs on a ladder, not the Career goal's stability (§3).
 */
export const NewsEffectsSchema = z.object({
  /** Added to the ×1 multiplier on the AI-disruption chance (FR-42). */
  disruptionBp: Bp.min(-10_000).default(0),
  /** Added to the AI exposure of every job on these ladders, for the disruption roll. */
  exposure: z.array(z.object({ ladder: Id, bp: Bp })).default([]),
  /** Surge (or slump) on GigHub pay (FR-44). */
  gigPayBp: Bp.min(-10_000).default(0),
  /** Added to the weekly price drift (FR-50). */
  inflationBp: Bp.default(0),
  /** Added to the rent hike rolled at lease renewal (FR-51). */
  rentHikeBp: Bp.default(0),
  /** Added to the weekly savings and card rates, in parts per million (FR-53, FR-54). */
  savingsPpm: z.number().int().default(0),
  cardPpm: z.number().int().default(0),
  /** Added to every job's weekly chance of an opening. */
  openingsBp: Bp.default(0),
  /** The market switches to this regime when the story breaks (FR-55). */
  regime: Id.optional(),
});

export type NewsEffects = z.infer<typeof NewsEffectsSchema>;

/** A news story (FR-72). Copy keys: `news.<id>` (headline) and `news.<id>.text`. */
export const NewsSchema = z.object({
  id: Id,
  weight: Weight,
  weeks: IntRange.refine((r) => r.min >= 1, 'a story runs at least a week'),
  minWeek: z.number().int().positive().optional(),
  effects: NewsEffectsSchema,
});

export type News = z.infer<typeof NewsSchema>;

/** What a quest asks for. Progress is measured from the moment it was issued. */
export const QuestGoalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save'), amount: Cents.min(1) }),
  z.object({ kind: z.literal('stat'), stat: StatKeySchema, atLeast: z.number().int() }),
  z.object({ kind: z.literal('hired') }),
  z.object({ kind: z.literal('promoted') }),
  z.object({ kind: z.literal('credential') }),
  z.object({ kind: z.literal('debt-free') }),
  z.object({ kind: z.literal('move-up') }),
  z.object({ kind: z.literal('work'), minutes: Minutes.min(15) }),
  z.object({ kind: z.literal('study'), minutes: Minutes.min(15) }),
]);

export type QuestGoal = z.infer<typeof QuestGoalSchema>;

/** A micro-goal (ENG-11). Copy key: `quest.<id>`. */
export const QuestSchema = z.object({
  id: Id,
  weight: Weight,
  /** Weeks to finish it, counting the week it's issued in. */
  weeks: z.number().int().positive(),
  /** Only issued when this holds, so "Get hired" isn't offered to someone with a job. */
  when: ConditionSchema.optional(),
  goal: QuestGoalSchema,
  reward: z.object({ cash: Cents.default(0), stats: StatDeltas.default({}) }),
});

export type Quest = z.infer<typeof QuestSchema>;

/** A utility-AI persona: one scorer, different weights (simulator §3, FR-80). */
export const PersonaSchema = z
  .object({
    id: Id,
    /** How much each goal's progress is worth. Sums to 10 000. */
    goalWeightsBp: z.record(z.enum(GOAL_KEYS), Chance),
    /**
     * Extra value on the weakest goal's progress. Winning needs all four (FR-11), so a balanced player shores up
     * whatever lags.
     */
    bottleneckBp: Chance,
    /** 5000 is neutral; higher likes volatile assets and gambles, lower avoids them. */
    riskAppetiteBp: Chance,
    /** Weeks ahead the bot values ongoing income, costs and buffs. */
    horizonWeeks: z.number().int().positive(),
    /** How often the bot takes its top-scored move (FR-83); otherwise one of its top `runnersUp` moves. */
    bestMoveRateBp: Chance,
    /** How many of the top moves it picks between when it doesn't take the best one. */
    runnersUp: z.number().int().positive(),
    notes: z.string(),
  })
  .refine(
    (p) => GOAL_KEYS.reduce((sum, k) => sum + p.goalWeightsBp[k], 0) === 10_000,
    'goal weights must sum to 10 000',
  );

export type Persona = z.infer<typeof PersonaSchema>;

/** Scorer tuning shared by every persona (simulator §3). Balance data, so it's tuned without code changes. */
export const UtilityTuningSchema = z.object({
  /** Ongoing weekly buffs are valued over at most this many weeks, so a gadget isn't worth a fortune. */
  buffWeeks: z.number().int().positive(),
  /** Energy below this costs value: work and study pay less and 0 ends the week (FR-21). */
  energyComfort: z.number().int().nonnegative(),
  /** Value lost per Energy point below comfort. */
  energyPenalty: z.number().int().nonnegative(),
  /**
   * Cash on hand up to this many cents is worth `liquidityBp` extra: money in savings can't pay tuition or a deposit
   * without a trip to NeoBank, so the bot keeps a cushion instead of saving every cent.
   */
  cashCushion: Cents,
  liquidityBp: Chance,
  /** Minutes a week the scorer expects to work, when it values a job's future pay. */
  workMinutesPerWeek: Minutes.min(15),
  /** Minutes it counts for a step toward a promotion that isn't study or work: enrolling, shopping, dropping a course. */
  stepMinutes: Minutes.min(15),
  /** Weight of future pay: jobs end and hours get cut (FR-42). */
  futurePayBp: Chance,
  /** Share of the next rung's career points credited for being on the way to it. */
  aspirationBp: Chance,
  /**
   * Full-time weeks of effort (experience, study, rating) at which the next rung counts half: the shorter, the more
   * each hour toward a promotion is worth.
   */
  patienceWeeks: z.number().int().positive(),
  /** Value of expected progress (future pay, buffs, readiness), relative to progress already made. */
  prospectBp: Chance,
  /** Value of progress past a target, per unit, relative to progress below it. */
  overshootBp: Chance,
  /** Progress stops adding value here. Above 100% so the bot keeps a margin and an overshoot (FR-11). */
  valueCapBp: z.number().int().min(10_000),
  /** Takes a longer version of the best action if it scores within this share of it: fewer, longer shifts. */
  longerSlackBp: Chance,
});

export type UtilityTuning = z.infer<typeof UtilityTuningSchema>;

/** The AI rival (FR-80–FR-83): scorer tuning and Jones's personas. `byDifficulty` picks one per preset (FR-83). */
export const AiSchema = z.object({
  utility: UtilityTuningSchema,
  rivals: z.array(PersonaSchema).min(1),
  byDifficulty: z.record(z.enum(DIFFICULTIES), Id),
});

export type Ai = z.infer<typeof AiSchema>;
