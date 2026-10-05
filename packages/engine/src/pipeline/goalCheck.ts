/** R3: the round-end win check (FR-11) and the week limit with scoring (FR-12). */
import type { GameContent } from '@fastlane/content';
import type { RoundCtx } from '../core/context.ts';
import { goalValues, hasWon, overshootBp, progressBp, scoreBp } from '../goals/goals.ts';
import type { GameResult, GameState, PlayerId } from '../types/state.ts';
import type { PipelineStep } from './types.ts';

/** Each player's score in basis points (FR-12). */
export function scores(content: GameContent, state: Readonly<GameState>): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const p of state.players)
    out[p.id] = scoreBp(progressBp(goalValues(content, p), state.config.goals));
  return out;
}

/** The highest value wins; ties go to the earlier seat, so the result never depends on sort stability. */
function best(ids: PlayerId[], value: (id: PlayerId) => number): PlayerId {
  let winner = ids[0];
  if (winner === undefined) throw new Error('no candidates');
  for (const id of ids) if (value(id) > value(winner)) winner = id;
  return winner;
}

/**
 * Everyone who has met all four targets at the end of the round qualifies, so turn order gives no advantage; the
 * biggest total overshoot wins (FR-11). At the week limit the highest score wins (FR-12).
 */
export const goalCheck: PipelineStep<RoundCtx> = {
  id: 'goal-check',
  run({ state, content, emit }) {
    const { goals, weekLimit } = state.config;
    const all = scores(content, state);
    const values = Object.fromEntries(state.players.map((p) => [p.id, goalValues(content, p)]));
    const qualified = state.players
      .filter((p) => hasWon(progressBp(values[p.id] ?? goalValues(content, p), goals)))
      .map((p) => p.id);
    let result: GameResult | null = null;
    if (qualified.length > 0) {
      const winner = best(qualified, (id) => {
        const v = values[id];
        return v ? overshootBp(v, goals) : 0;
      });
      result = { reason: 'win', week: state.week, winner, scores: all };
    } else if (weekLimit !== null && state.week >= weekLimit) {
      const winner = best(
        state.players.map((p) => p.id),
        (id) => all[id] ?? 0,
      );
      result = { reason: 'weekLimit', week: state.week, winner, scores: all };
    }
    if (result) {
      state.phase = { kind: 'gameOver', result };
      emit({ type: 'gameOver', result });
    }
    return { done: true };
  },
};
