/**
 * The FR-05 step order, in one place. `order.test.ts` pins it, so reordering is a deliberate, reviewed change.
 * Stubs are filled in by later phases (engine-design §11).
 */
import type { PlayerCtx, RoundCtx } from '../core/context.ts';
import { changeStats } from '../stats/stats.ts';
import type { Pipeline, PipelineStep } from './types.ts';

const done = { done: true } as const;
const stub = <Ctx>(id: string): PipelineStep<Ctx> => ({ id, run: () => done });

/** P1: penalise a week without a meal (§4 Hunger), then reset the count. */
export const foodCheck: PipelineStep<PlayerCtx> = {
  id: 'food-check',
  run(ctx) {
    const { player } = ctx;
    if (player.mealsThisWeek === 0) {
      ctx.emit({ type: 'mealSkipped', player: player.id });
      changeStats(ctx, player, ctx.content.balance.hungerPenalty, {
        kind: 'step',
        id: 'food-check',
      });
    }
    player.mealsThisWeek = 0;
    return done;
  },
};

/** P5: weekly sleep recovery and decay (Energy, Health, Social; Relationships join in Phase 9). */
export const statDrift: PipelineStep<PlayerCtx> = {
  id: 'stat-drift',
  run(ctx) {
    changeStats(ctx, ctx.player, ctx.content.balance.weeklyDrift, {
      kind: 'step',
      id: 'stat-drift',
    });
    return done;
  },
};

/** R3: ends the game at the week limit (FR-12). Goal targets and the win check arrive in Phase 2 (FR-11). */
export const goalCheck: PipelineStep<RoundCtx> = {
  id: 'goal-check',
  run({ state, emit }) {
    const { weekLimit } = state.config;
    if (weekLimit !== null && state.week >= weekLimit) {
      const result = { reason: 'weekLimit', week: state.week } as const;
      state.phase = { kind: 'gameOver', result };
      emit({ type: 'gameOver', result });
    }
    return done;
  },
};

export const defaultPipeline: Pipeline = {
  perPlayer: [
    foodCheck,
    stub('bills'), // Phase 2: rent, bills, subscriptions
    stub('interest-debt'), // Phase 2: interest and debt payments
    stub('job-checks'), // Phase 2: AI disruption
    statDrift,
    stub('weekend-event'), // Phase 3: may pause for a choice
    stub('quest-progress'), // Phase 3
  ],
  perRound: [
    stub('market'), // Phase 2
    stub('news'), // Phase 3
    goalCheck,
    stub('teasers'), // Phase 3
  ],
};
