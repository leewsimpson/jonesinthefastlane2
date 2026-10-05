/**
 * AI policies pick moves for AI players inside the engine, using the player's `ai` stream, so a replay recomputes
 * them exactly (engine-design §7). Phase 1 ships a random legal policy; the utility scorer arrives in Phase 3.
 */
import type { Rng } from '../rng/rng.ts';
import type { Action, Preview } from '../types/actions.ts';
import type { Decision } from '../types/state.ts';

export interface AiPolicy {
  /** `options` are the available ones only, never empty (End Week is always available). */
  chooseAction(options: readonly Preview[], rng: Rng): Action;
  chooseOption(decision: Decision, rng: Rng): string;
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
