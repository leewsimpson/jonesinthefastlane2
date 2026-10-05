/** Commands, plans and previews (engine-design §8). */
import type { ModifierTarget, StatKey } from '@fastlane/content/keys';
import type { DomainEvent } from './events.ts';
import type { GameState } from './state.ts';

/**
 * What a `perform` is aimed at, for action kinds that take it: a job, course, item, housing tier, subscription,
 * account or debt (`target`), a length for work and study (`minutes`), or a sum of money (`amount`, cents).
 */
export interface PerformParams {
  target?: string;
  minutes?: number;
  amount?: number;
}

/** Everything a player can submit. Actions carry no player id: they always apply to the active player. */
export type Action =
  | { type: 'travel'; to: string; mode: string }
  | ({ type: 'perform'; actionId: string } & PerformParams)
  | { type: 'endWeek' }
  | { type: 'decide'; decisionId: string; optionId: string };

export type RuleErrorCode =
  | 'GAME_OVER'
  | 'DECISION_PENDING'
  | 'NO_SUCH_DECISION'
  | 'UNKNOWN_OPTION'
  | 'UNKNOWN_LOCATION'
  | 'UNKNOWN_MODE'
  | 'UNKNOWN_ACTION'
  | 'ALREADY_THERE'
  | 'WRONG_LOCATION'
  | 'NEEDS_ITEM'
  | 'NEEDS_HOUSING'
  | 'NOT_ENOUGH_TIME'
  | 'NOT_ENOUGH_MONEY'
  | 'BAD_TARGET'
  | 'BAD_DURATION'
  | 'BAD_AMOUNT'
  | 'NO_JOB'
  | 'HOURS_CAP'
  | 'GIG_DEACTIVATED'
  | 'NOT_OPEN'
  | 'ALREADY_HIRED'
  | 'DRESS_CODE'
  | 'NEEDS_CREDENTIAL'
  | 'NEEDS_SKILL'
  | 'NEEDS_EXPERIENCE'
  | 'ALREADY_ENROLLED'
  | 'ALREADY_EARNED'
  | 'NOT_ENROLLED'
  | 'NO_LOAN'
  | 'ALREADY_OWNED'
  | 'NOTHING_STORED'
  | 'CREDIT_CHECK'
  | 'RENT_OWED'
  | 'ALREADY_SUBSCRIBED'
  | 'NOT_SUBSCRIBED'
  | 'OVER_LIMIT'
  | 'NO_DEBT';

/** A rule the player broke. Bugs in the engine throw instead (engine-design §3). */
export interface RuleError {
  code: RuleErrorCode;
}

export interface StatDelta {
  stat: StatKey;
  delta: number;
}

/** A random effect, shown as a range before the roll (FR-03). */
export interface OutcomeRange {
  stat: StatKey;
  min: number;
  max: number;
}

/**
 * A modifier in effect on this action, e.g. `{ source: 'modifier.low-energy', target: 'workOutput', bp: -2000 }`
 * (FR-21). `source` is the copy key of what causes it: `modifier.<id>`, `item.<id>`, `subscription.<id>` or
 * `track.<id>`.
 */
export interface AppliedModifier {
  source: string;
  target: ModifierTarget;
  bp: number;
}

/** What an action costs and does, worked out without changing state or using RNG. `apply` carries out this plan. */
export interface Plan {
  /** Minutes spent. */
  time: number;
  /** Cents paid up front. */
  money: number;
  /** Deterministic stat changes, before clamping, already scaled by `modifiers`. */
  effects: StatDelta[];
  modifiers: AppliedModifier[];
  /** Random stat changes, already scaled by `modifiers`. Rolled inside the range shown. */
  outcomes: OutcomeRange[];
}

/**
 * `listActions` and `preview` return these. Unavailable options still carry their plan when it could be worked out,
 * so the UI can say "costs $12, you have $5".
 */
export type Preview =
  | { action: Action; available: true; plan: Plan }
  | { action: Action; available: false; reason: RuleError; plan: Plan | null };

export type ReduceResult =
  | { ok: true; state: GameState; events: DomainEvent[] }
  /** The input state is untouched. */
  | { ok: false; error: RuleError };
