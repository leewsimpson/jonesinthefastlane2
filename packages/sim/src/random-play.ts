import type { GameContent } from '@fastlane/content';
import {
  createEngine,
  type GameAction,
  type GameSetup,
  type GameState,
  nextInt,
  seedRng,
} from '@fastlane/engine';

export interface RandomPlayResult {
  setup: GameSetup;
  actions: GameAction[];
  state: GameState;
  hash: string;
  replayHash: string;
}

/**
 * Play `weeks` weeks of uniformly random legal actions, then replay the log and hash both results. The chooser has
 * its own generator, seeded separately, so it never touches the game's streams.
 */
export function randomPlay(
  content: GameContent,
  setup: GameSetup,
  weeks: number,
  chooserSeed: number,
): RandomPlayResult {
  const engine = createEngine(content);
  const chooser = seedRng(chooserSeed);
  let state = engine.newGame(setup);
  const actions: GameAction[] = [];
  const lastWeek = state.week + weeks;
  while (state.week < lastWeek) {
    const legal = engine.legalActions(state);
    const action = legal[nextInt(chooser, 0, legal.length - 1)];
    if (!action) throw new Error('no legal action');
    actions.push(action);
    state = engine.reduce(state, action).state;
  }
  const replayHash = engine.hash(engine.replay(setup, actions));
  return { setup, actions, state, hash: engine.hash(state), replayHash };
}
