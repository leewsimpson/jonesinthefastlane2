/**
 * Action handlers: the code for one action `kind`, split into a pure `plan` and an `apply` that carries the plan out
 * (engine-design §8.2). Content says where, which handler and with which numbers; Phase 2 adds kinds, not commands.
 */
import type { LocationAction } from '@fastlane/content';
import { type ActionKind, STAT_KEYS } from '@fastlane/content/keys';
import type { PlanCtx, PlayerCtx } from '../core/context.ts';
import { changeStat, collectModifiers, scaleGain } from '../stats/stats.ts';
import type { OutcomeRange, Plan, RuleError, StatDelta } from '../types/actions.ts';

export interface ActionHandler {
  /** Pure and RNG-free (`PlanCtx` has no RNG). Returns a rule error if this kind has its own requirements. */
  plan(ctx: PlanCtx, def: LocationAction): Plan | RuleError;
  /** Carries out the plan the player saw, so the shown cost is the charged cost. May roll on `ctx.rng`. */
  apply(ctx: PlayerCtx, def: LocationAction, plan: Plan): void;
}

/** Fixed time and cost; effects from data, ranged ones rolled on the `action` stream. */
function planFromData(ctx: PlanCtx, def: LocationAction): Plan {
  const modifiers = def.outputTarget
    ? collectModifiers(ctx.content, ctx.player, def.outputTarget)
    : [];
  const effects: StatDelta[] = [];
  const outcomes: OutcomeRange[] = [];
  for (const stat of STAT_KEYS) {
    const effect = def.effects[stat];
    if (effect === undefined) continue;
    if (typeof effect === 'number') effects.push({ stat, delta: scaleGain(effect, modifiers) });
    else
      outcomes.push({
        stat,
        min: scaleGain(effect.min, modifiers),
        max: scaleGain(effect.max, modifiers),
      });
  }
  return { time: def.minutes, money: def.cost, effects, modifiers, outcomes };
}

/** Spend the time, pay the cost, then apply effects and roll outcomes, all in `STAT_KEYS` order. */
function applyPlan(ctx: PlayerCtx, def: LocationAction, plan: Plan): void {
  const { player } = ctx;
  const cause = { kind: 'action', id: def.id } as const;
  player.timeLeft -= plan.time;
  if (plan.money > 0) changeStat(ctx, player, 'cash', -plan.money, cause);
  for (const e of plan.effects) changeStat(ctx, player, e.stat, e.delta, cause);
  for (const o of plan.outcomes)
    changeStat(ctx, player, o.stat, ctx.rng('action').int(o.min, o.max), cause);
}

const basic: ActionHandler = { plan: planFromData, apply: applyPlan };

/** A meal: satisfies the food check (§4 Hunger). */
const eat: ActionHandler = {
  plan: planFromData,
  apply(ctx, def, plan) {
    applyPlan(ctx, def, plan);
    ctx.player.mealsThisWeek += 1;
  },
};

export const HANDLERS: Record<ActionKind, ActionHandler> = { basic, eat };
