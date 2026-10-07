/**
 * The FR-05 step order, in one place. `order.test.ts` pins it, so reordering is a deliberate, reviewed change.
 * Jones's recap (`rival-feed`) sits between the goal check and the teasers, as in the core loop (§2).
 */
import type { PlayerCtx } from '../core/context.ts';
import { changeStats } from '../stats/stats.ts';
import type { Cause } from '../types/events.ts';
import { bills, subscriptionsPaid } from './bills.ts';
import { interestAndDebt } from './debts.ts';
import { goalCheck } from './goalCheck.ts';
import { jobChecks } from './jobChecks.ts';
import { marketMove } from './market.ts';
import { newsStep } from './news.ts';
import { questProgress } from './quests.ts';
import { rivalFeed } from './rivalFeed.ts';
import { teasers } from './teasers.ts';
import type { Pipeline, PipelineStep } from './types.ts';
import { weekendEvent } from './weekendEvent.ts';

const done = { done: true } as const;

/**
 * P1: penalise a week without a meal (§4 Hunger), then reset the count. Delivered meals count (FR-52) when this
 * week's bills will pay for them.
 */
export const foodCheck: PipelineStep<PlayerCtx> = {
  id: 'food-check',
  run(ctx) {
    const { player, content } = ctx;
    let meals = player.mealsThisWeek;
    const paid = subscriptionsPaid(ctx);
    for (const sub of content.city.subscriptions) if (paid.has(sub.id)) meals += sub.meals ?? 0;
    if (meals === 0) {
      ctx.emit({ type: 'mealSkipped', player: player.id });
      changeStats(ctx, player, content.balance.hungerPenalty, { kind: 'step', id: 'food-check' });
    }
    player.mealsThisWeek = 0;
    return done;
  },
};

/**
 * P5: weekly sleep recovery and decay, then what home, items and subscriptions give each week (FR-51, FR-52,
 * FR-60). Relationships join in Phase 9.
 */
export const statDrift: PipelineStep<PlayerCtx> = {
  id: 'stat-drift',
  run(ctx) {
    const { player, content } = ctx;
    const cause: Cause = { kind: 'step', id: 'stat-drift' };
    changeStats(ctx, player, content.balance.weeklyDrift, cause);
    const home = content.city.housing.find((h) => h.id === player.housing.tier);
    if (home) changeStats(ctx, player, home.weekly, cause);
    for (const item of content.city.items)
      if (player.items.includes(item.id)) changeStats(ctx, player, item.weekly, cause);
    for (const sub of content.city.subscriptions)
      if (player.subscriptions.includes(sub.id)) changeStats(ctx, player, sub.weekly, cause);
    return done;
  },
};

export const defaultPipeline: Pipeline = {
  perPlayer: [foodCheck, bills, interestAndDebt, jobChecks, statDrift, weekendEvent, questProgress],
  perRound: [marketMove, newsStep, goalCheck, rivalFeed, teasers],
};
