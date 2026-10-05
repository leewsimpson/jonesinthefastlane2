/**
 * AI policies pick moves for AI players inside the engine, using the player's `ai` stream, so a replay recomputes
 * them exactly (engine-design §7). This is the random legal policy; the utility scorer is in `utility.ts`.
 */
import type { Rng } from '../rng/rng.ts';
import type { Action, Preview } from '../types/actions.ts';
import type { Decision, GameState } from '../types/state.ts';

export interface AiPolicy {
  /**
   * `options` are the available ones only, never empty (End Week is always available). `state` is read-only: the
   * policy sees what the player could see (simulator §2).
   */
  chooseAction(options: readonly Preview[], rng: Rng, state: Readonly<GameState>): Action;
  chooseOption(decision: Decision, rng: Rng, state: Readonly<GameState>): string;
}

function pickOne<T>(items: readonly T[], rng: Rng): T {
  const item = items[rng.int(0, items.length - 1)];
  if (item === undefined) throw new Error('nothing to choose from');
  return item;
}

export const randomPolicy: AiPolicy = {
  chooseAction: (options, rng) => pickOne(options, rng).action,
  chooseOption: (decision, rng) => pickOne(decision.options, rng),
};
