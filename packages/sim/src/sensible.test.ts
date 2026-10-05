/**
 * Phase 2 exit criterion: a scripted "sensible" strategy can win a Standard game (implementation-plan Phase 2).
 * Agreed bar: it wins on at least 8 of 10 seeds within 52 weeks, and every game replays to the same state.
 */
import { defaultContent } from '@fastlane/content';
import { createEngine, type GameState } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { sensibleBot } from './bots/sensible.ts';
import { playGame } from './game.ts';

const engine = createEngine(defaultContent);
const setupFor = (seed: string) => ({
  seed,
  players: [{ name: 'Ada', controller: 'human' as const }],
  config: { difficulty: 'standard' as const, weekLimit: 52 },
});
const result = (state: GameState) => (state.phase.kind === 'gameOver' ? state.phase.result : null);

describe('scripted sensible strategy (Phase 2 exit criterion)', () => {
  const games = Array.from({ length: 10 }, (_, i) => {
    const setup = setupFor(`sensible-${i}`);
    return { setup, ...playGame(engine, setup, [sensibleBot]) };
  });

  it('wins a Standard game on at least 8 of 10 seeds within 52 weeks', () => {
    const wins = games.filter((g) => result(g.state)?.reason === 'win');
    expect(wins.length).toBeGreaterThanOrEqual(8);
    for (const g of wins) expect(result(g.state)?.week).toBeLessThanOrEqual(52);
  });

  it('replays every game to the identical state', () => {
    for (const g of games)
      expect(engine.hash(engine.replay(g.setup, g.log))).toBe(engine.hash(g.state));
  });
});
