/**
 * Scenario starts (simulator §7): a game that begins from a set position, such as "broke, in debt and back with the
 * parents", so a recovery arc (FR-14) can be tested without playing 20 weeks to get there. A scenario patches each
 * human seat right after `newGame`, merging like an override file. It's a sim-only tool, never a game rule.
 */
import { readFileSync } from 'node:fs';
import type { GameState } from '@fastlane/engine';
import { merge } from './override.ts';

export interface Scenario {
  id: string;
  note: string;
  /** Merged into every human player's state. */
  player: Record<string, unknown>;
}

export function loadScenario(path: string): Scenario {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<Scenario>;
  if (typeof data.id !== 'string' || typeof data.player !== 'object' || data.player === null)
    throw new Error(`${path}: a scenario needs an id and a player patch`);
  return { id: data.id, note: data.note ?? '', player: data.player };
}

/** Apply a scenario to a new game, in place. */
export function applyScenario(state: GameState, scenario: Scenario): void {
  state.players = state.players.map((p) =>
    p.controller === 'human' ? (merge(p, scenario.player) as typeof p) : p,
  );
}
