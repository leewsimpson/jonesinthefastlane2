/**
 * R1: the shared economy moves once per round, on the `world` stream (FR-05a, NFR-12): inflation (FR-50), the market
 * random walk with regimes and crashes (FR-53, FR-55), and next week's job openings. Every week draws the same
 * numbers in the same order whatever the players did.
 */
import type { GameContent } from '@fastlane/content';
import type { RoundCtx } from '../core/context.ts';
import { applyBp, BP_ONE } from '../math/fixed.ts';
import { transfer } from '../money/ledger.ts';
import type { Rng } from '../rng/rng.ts';
import type { Cause } from '../types/events.ts';
import type { WorldState } from '../types/state.ts';
import type { PipelineStep } from './types.ts';

const cause: Cause = { kind: 'step', id: 'market' };

/** Each job opens with its own weekly chance; always-open entry jobs keep the FR-14 floor. */
function rollOpenings(content: GameContent, rng: Rng): string[] {
  return content.city.jobs.filter((j) => rng.chance(j.openChanceBp)).map((j) => j.id);
}

/** The world at the start of a game. Draws from its own week-0 generator. */
export function initialWorld(content: GameContent, rng: Rng): WorldState {
  const { market } = content.balance;
  const start = market.regimes.find((r) => r.id === market.startRegime);
  if (!start) throw new Error(`unknown regime ${market.startRegime}`);
  return {
    priceIndexBp: BP_ONE,
    wageIndexBp: BP_ONE,
    regime: start.id,
    regimeWeeksLeft: rng.int(start.weeks.min, start.weeks.max),
    lastReturnsBp: Object.fromEntries(market.assets.map((a) => [a.id, 0])),
    openings: rollOpenings(content, rng),
  };
}

export const marketMove: PipelineStep<RoundCtx> = {
  id: 'market',
  run(ctx) {
    const { state, content } = ctx;
    const { world } = state;
    const { inflation, market } = content.balance;
    const rng = ctx.rng('world');

    const drift = rng.int(inflation.weeklyDriftBp.min, inflation.weeklyDriftBp.max);
    world.priceIndexBp += applyBp(world.priceIndexBp, drift);
    world.wageIndexBp += applyBp(world.priceIndexBp - world.wageIndexBp, inflation.wageCatchUpBp);

    world.regimeWeeksLeft -= 1;
    if (world.regimeWeeksLeft <= 0) {
      const next = rng.pick(market.regimes.map((r) => ({ weight: r.weight, value: r })));
      world.regime = next.id;
      world.regimeWeeksLeft = rng.int(next.weeks.min, next.weeks.max);
    }
    const regime = market.regimes.find((r) => r.id === world.regime);
    if (!regime) throw new Error(`unknown regime ${world.regime}`);
    for (const asset of market.assets) {
      const range = regime.returnsBp[asset.id];
      if (!range) throw new Error(`regime ${regime.id} has no return for ${asset.id}`);
      const ret = rng.int(range.min, range.max);
      world.lastReturnsBp[asset.id] = rng.chance(asset.crashChanceBp) ? asset.crashBp : ret;
    }

    for (const player of state.players)
      for (const asset of market.assets) {
        const change = applyBp(player.holdings[asset.id] ?? 0, world.lastReturnsBp[asset.id] ?? 0);
        const place = `hold:${asset.id}` as const;
        if (change > 0) transfer(ctx, player, 'outside', place, change, 'market', cause);
        else if (change < 0) transfer(ctx, player, place, 'outside', -change, 'market', cause);
      }

    world.openings = rollOpenings(content, rng);
    ctx.emit({
      type: 'marketMoved',
      week: state.week,
      regime: world.regime,
      returnsBp: { ...world.lastReturnsBp },
      priceIndexBp: world.priceIndexBp,
      wageIndexBp: world.wageIndexBp,
    });
    return { done: true };
  },
};
