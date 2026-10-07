/**
 * The debug replay route's model (simulator §4): a game's state after each human action, so a sim game (or a save)
 * can be stepped through on the board. Built once with `reduce`, which never changes its input, so every step is
 * its own snapshot.
 */
import type { Action, Engine, GameSetup, GameState } from '@fastlane/engine';

export interface ReplaySteps {
  /** `states[0]` is the new game; `states[i]` is the state after `log[i - 1]`. */
  states: GameState[];
  log: Action[];
  /** Set when an action was illegal: the replay stops before it. */
  error: { index: number; code: string } | null;
}

export function replaySteps(engine: Engine, setup: GameSetup, log: readonly Action[]): ReplaySteps {
  const states = [engine.newGame(setup).state];
  for (const [index, action] of log.entries()) {
    const last = states.at(-1) as GameState;
    const result = engine.reduce(last, action);
    if (!result.ok)
      return { states, log: log.slice(0, index), error: { index, code: result.error.code } };
    states.push(result.state);
  }
  return { states, log: [...log], error: null };
}

/** The step where `week` starts, or the last step if the game never got there. */
export function stepOfWeek(steps: ReplaySteps, week: number): number {
  const i = steps.states.findIndex((s) => s.week >= week);
  return i === -1 ? steps.states.length - 1 : i;
}

/** The human seat whose view to show at a step: whoever must act, or the first human once the game is over. */
export function viewer(state: GameState): string {
  if (state.pending) return state.pending.player;
  if (state.phase.kind === 'turn') return state.phase.player;
  return state.players.find((p) => p.controller === 'human')?.id ?? state.players[0]?.id ?? 'p1';
}
