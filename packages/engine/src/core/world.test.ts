import { defaultContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng.ts';
import type { GameSetup, GameState, WorldState } from '../types/state.ts';
import { hashValue } from './hash.ts';
import { createEngine } from './reduce.ts';

const engine = createEngine(defaultContent);
const setup: GameSetup = {
  seed: 'daily-2026-10-05',
  players: [
    { name: 'Ada', controller: 'human' },
    { name: 'Jones', controller: 'ai' },
  ],
  config: { weekLimit: 20 },
};

/** The world at the start of every week of a game where the human plays at random with `chooser`. */
function worlds(chooser: string): string[] {
  const rng = createRng(chooser);
  const { state } = engine.newGame(setup);
  const seen: string[] = [hashValue(state.world)];
  let week = state.week;
  const record = (s: GameState, world: WorldState) => {
    if (s.week !== week) {
      week = s.week;
      seen.push(hashValue(world));
    }
  };
  while (state.phase.kind !== 'gameOver') {
    const options = engine.listActions(state).filter((o) => o.available);
    const option = options[rng.int(0, options.length - 1)];
    if (!option) throw new Error('no available action');
    const result = engine.reduceInPlace(state, option.action);
    if (!result.ok) throw new Error(result.error.code);
    record(state, state.world);
  }
  return seen;
}

describe('the world stream (NFR-12, FR-05a)', () => {
  it('gives every player the same economy and news whatever they do', () => {
    const a = worlds('chooser-a');
    const b = worlds('chooser-b');
    expect(a.length).toBeGreaterThan(10);
    expect(b).toEqual(a);
  });
});
