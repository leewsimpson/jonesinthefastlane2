/**
 * P6: the weekend event (FR-70, FR-71). Draw a card from the weighted, condition-filtered deck on the player's
 * `events` stream; a week that ended at 0 Energy draws a burnout card instead (§4 Energy). A card with one choice
 * applies at once; with more, the step pauses and the player (or the AI policy) picks (engine-design §11).
 */
import type { EventChoice, GameContent, WeekendEvent } from '@fastlane/content';
import { STAT_KEYS } from '@fastlane/content/keys';
import { applyDelta } from '../actions/common.ts';
import { emptyPlan } from '../actions/plan.ts';
import type { PlayerCtx } from '../core/context.ts';
import { price } from '../economy/prices.ts';
import { meets } from '../hooks/conditions.ts';
import { clamp } from '../math/fixed.ts';
import { transfer } from '../money/ledger.ts';
import type { Cause } from '../types/events.ts';
import type { ChoicePlan, WorldState } from '../types/state.ts';
import type { PipelineStep } from './types.ts';

const STEP_ID = 'weekend-event';

export function eventById(content: GameContent, id: string): WeekendEvent {
  const card = content.events.find((e) => e.id === id);
  if (!card) throw new Error(`unknown event ${id}`);
  return card;
}

/** Cards this player could draw this week. */
function deck(ctx: PlayerCtx, burnout: boolean): WeekendEvent[] {
  const { content, player, week } = ctx;
  const fallback = content.balance.events.cooldownWeeks;
  return content.events.filter((e) => {
    if ((e.trigger === 'burnout') !== burnout) return false;
    const seen = player.seenEvents[e.id];
    if (seen !== undefined && week - seen < (e.cooldownWeeks ?? fallback)) return false;
    return meets(content, week, player, e.when);
  });
}

/** What a choice costs and does, as the player sees it before picking (FR-03). */
export function choicePlan(world: Readonly<WorldState>, choice: EventChoice): ChoicePlan {
  const plan: ChoicePlan = {
    ...emptyPlan(),
    money: price(world, choice.cost),
    nextWeekMinutes: choice.nextWeekMinutes,
    jobRating: choice.jobRating,
    layoffWarning: choice.layoffWarning,
    gigBanWeeks: choice.gigBanWeeks,
  };
  for (const stat of STAT_KEYS) {
    const effect = choice.effects[stat];
    if (effect === undefined) continue;
    if (typeof effect === 'number') plan.effects.push({ stat, delta: effect });
    else plan.outcomes.push({ stat, min: effect.min, max: effect.max });
  }
  return plan;
}

/** The choices on offer: those whose condition holds and that cash covers. Always at least one (content check). */
function offered(ctx: PlayerCtx, card: WeekendEvent): EventChoice[] {
  const { content, player, week, world } = ctx;
  return card.choices.filter(
    (c) => meets(content, week, player, c.when) && price(world, c.cost) <= player.stats.cash,
  );
}

function apply(ctx: PlayerCtx, card: WeekendEvent, choiceId: string, plan: ChoicePlan): void {
  const { player } = ctx;
  const cause: Cause = { kind: 'event', id: card.id };
  transfer(ctx, player, 'cash', 'outside', plan.money, 'spend', cause);
  for (const e of plan.effects) applyDelta(ctx, e.stat, e.delta, cause, 'income');
  for (const o of plan.outcomes)
    applyDelta(ctx, o.stat, ctx.rng('events').int(o.min, o.max), cause, 'income');
  player.nextWeekMinutes += plan.nextWeekMinutes;
  if (player.job) {
    player.job.rating = clamp(player.job.rating + plan.jobRating, 0, 100);
    if (plan.layoffWarning && !player.job.layoffWarning) {
      player.job.layoffWarning = true;
      ctx.emit({
        type: 'jobChanged',
        player: player.id,
        change: 'layoffWarning',
        job: player.job.id,
      });
    }
  }
  if (plan.gigBanWeeks > player.gigBanWeeks) {
    player.gigBanWeeks = plan.gigBanWeeks;
    ctx.emit({ type: 'gigDeactivated', player: player.id, weeks: plan.gigBanWeeks });
  }
  ctx.emit({ type: 'eventResolved', player: player.id, event: card.id, choice: choiceId });
}

export const weekendEvent: PipelineStep<PlayerCtx> = {
  id: STEP_ID,
  run(ctx) {
    const { player, content, week } = ctx;
    const burnout = player.burnout;
    player.burnout = false;
    const rng = ctx.rng('events');
    if (!burnout && !rng.chance(content.balance.events.chanceBp)) return { done: true };
    const cards = deck(ctx, burnout);
    if (cards.length === 0) return { done: true };
    const card = rng.pick(cards.map((e) => ({ weight: e.weight, value: e })));
    player.seenEvents[card.id] = week;
    ctx.emit({ type: 'weekendEvent', player: player.id, event: card.id, category: card.category });

    const choices = offered(ctx, card);
    const plans = Object.fromEntries(choices.map((c) => [c.id, choicePlan(ctx.world, c)]));
    const [only] = choices;
    if (!only) throw new Error(`event ${card.id} offers no choice`);
    if (choices.length === 1) {
      apply(ctx, card, only.id, plans[only.id] as ChoicePlan);
      return { done: true };
    }
    return {
      pause: {
        id: ctx.newId('decision'),
        player: player.id,
        stepId: STEP_ID,
        subject: card.id,
        options: choices.map((c) => c.id),
        plans,
      },
    };
  },
  resolve(ctx, decision, optionId) {
    const plan = decision.plans[optionId];
    if (!decision.subject || !plan) throw new Error(`no plan for ${optionId}`);
    apply(ctx, eventById(ctx.content, decision.subject), optionId, plan);
  },
};
