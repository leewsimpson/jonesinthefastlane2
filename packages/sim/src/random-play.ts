import type { GameContent } from '@fastlane/content';
import {
  type Action,
  createEngine,
  createRng,
  type GameSetup,
  type GameState,
} from '@fastlane/engine';

export interface RandomPlayResult {
  setup: GameSetup;
  log: Action[];
  state: GameState;
  hash: string;
  replayHash: string;
}

/**
 * Play to the setup's week limit, choosing uniformly among the humans' available actions (AI players are played by
 * the engine), then replay the log and hash both results. The chooser has its own generator, so it never touches
 * the game's streams.
 */
export function randomPlay(
  content: GameContent,
  setup: GameSetup,
  chooserSeed: string,
): RandomPlayResult {
  if (!setup.config?.weekLimit) throw new Error('random play needs a week limit');
  const engine = createEngine(content);
  const chooser = createRng(chooserSeed);
  const { state } = engine.newGame(setup);
  const log: Action[] = [];
  while (state.phase.kind !== 'gameOver') {
    const options = engine.listActions(state).filter((o) => o.available);
    const option = options[chooser.int(0, options.length - 1)];
    if (!option) throw new Error('no available action');
    log.push(option.action);
    const result = engine.reduceInPlace(state, option.action);
    if (!result.ok) throw new Error(`available action refused: ${result.error.code}`);
  }
  const replayHash = engine.hash(engine.replay(setup, log));
  return { setup, log, state, hash: engine.hash(state), replayHash };
}
