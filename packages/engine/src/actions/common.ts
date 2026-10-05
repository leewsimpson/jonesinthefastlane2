/** Helpers shared by action handlers (engine-design §8.2). */
import type { LocationAction } from '@fastlane/content';
import { STAT_KEYS } from '@fastlane/content/keys';
import type { PlanCtx, PlayerCtx } from '../core/context.ts';
import { price } from '../economy/prices.ts';
import { transfer } from '../money/ledger.ts';
import { changeStat, collectModifiers, scaleGain } from '../stats/stats.ts';
import type {
  OutcomeRange,
  PerformParams,
  Plan,
  RuleError,
  RuleErrorCode,
  StatDelta,
} from '../types/actions.ts';
import type { Cause, FlowReason } from '../types/events.ts';

export interface ActionHandler {
  /** The parameter variants `listActions` offers, e.g. one per job or per duration. Defaults to one per duration. */
  options?(ctx: PlanCtx, def: LocationAction): PerformParams[];
  /** Pure and RNG-free (`PlanCtx` has no RNG). Returns a rule error if this kind has its own requirements. */
  plan(ctx: PlanCtx, def: LocationAction, params: PerformParams): Plan | RuleError;
  /** Carries out the plan the player saw, so the shown cost is the charged cost. May roll on `ctx.rng`. */
  apply(ctx: PlayerCtx, def: LocationAction, plan: Plan, params: PerformParams): void;
}

export const fail = (code: RuleErrorCode): RuleError => ({ code });
export const isError = (x: Plan | RuleError): x is RuleError => 'code' in x;
export const actionCause = (def: LocationAction): Cause => ({ kind: 'action', id: def.id });

/** Minutes this perform takes: the chosen duration, or the action's fixed length. */
export const minutesOf = (def: LocationAction, params: PerformParams): number =>
  params.minutes ?? def.minutes;

/**
 * Time, cost and effects from data. For actions with `durations`, effects and cost are per `def.minutes` block and
 * scale with the chosen length. Cost follows the price index (FR-50). Positive effects are scaled by the action's
 * output modifiers; losses never are.
 */
export function planFromData(ctx: PlanCtx, def: LocationAction, params: PerformParams): Plan {
  const minutes = minutesOf(def, params);
  const blocks = minutes / def.minutes;
  const modifiers = def.outputTarget
    ? collectModifiers(ctx.content, ctx.player, def.outputTarget)
    : [];
  const effects: StatDelta[] = [];
  const outcomes: OutcomeRange[] = [];
  for (const stat of STAT_KEYS) {
    const effect = def.effects[stat];
    if (effect === undefined) continue;
    if (typeof effect === 'number')
      effects.push({ stat, delta: scaleGain(effect * blocks, modifiers) });
    else
      outcomes.push({
        stat,
        min: scaleGain(effect.min * blocks, modifiers),
        max: scaleGain(effect.max * blocks, modifiers),
      });
  }
  return {
    time: minutes,
    money: price(ctx.state.world, def.cost) * blocks,
    effects,
    modifiers,
    outcomes,
  };
}

/** Change one stat; cash goes through the ledger as income or spending. */
export function applyDelta(
  ctx: PlayerCtx,
  stat: StatDelta['stat'],
  delta: number,
  cause: Cause,
  income: FlowReason,
): void {
  const { player } = ctx;
  if (stat !== 'cash') changeStat(ctx, player, stat, delta, cause);
  else if (delta > 0) transfer(ctx, player, 'outside', 'cash', delta, income, cause);
  else if (delta < 0) transfer(ctx, player, 'cash', 'outside', -delta, 'spend', cause);
}

/**
 * Spend the time, pay the cost, then apply effects and roll outcomes, in `STAT_KEYS` order. `spend` names what the
 * up-front cost buys and `income` what a cash gain is, for the ledger.
 */
export function applyPlan(
  ctx: PlayerCtx,
  def: LocationAction,
  plan: Plan,
  reasons: { spend?: FlowReason; income?: FlowReason } = {},
): void {
  const { player } = ctx;
  const cause = actionCause(def);
  const income = reasons.income ?? 'income';
  player.timeLeft -= plan.time;
  if (plan.money > 0)
    transfer(ctx, player, 'cash', 'outside', plan.money, reasons.spend ?? 'spend', cause);
  for (const e of plan.effects) applyDelta(ctx, e.stat, e.delta, cause, income);
  for (const o of plan.outcomes)
    applyDelta(ctx, o.stat, ctx.rng('action').int(o.min, o.max), cause, income);
}

/** The default for actions with no parameters: one option, or one per duration. */
export function durationOptions(def: LocationAction): PerformParams[] {
  return def.durations ? def.durations.map((minutes) => ({ minutes })) : [{}];
}

/** Fixed time, cost and effects from data. */
export const basic: ActionHandler = {
  plan: planFromData,
  apply: (ctx, def, plan) => applyPlan(ctx, def, plan),
};

/** A meal: satisfies the food check (§4 Hunger). */
export const eat: ActionHandler = {
  plan: planFromData,
  apply(ctx, def, plan) {
    applyPlan(ctx, def, plan, { spend: 'spend' });
    ctx.player.mealsThisWeek += 1;
  },
};
