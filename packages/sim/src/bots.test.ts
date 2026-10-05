/** Smoke checks on the bots (simulator §3): they finish games, and the reference persona beats random play. */
import { defaultContent } from '@fastlane/content';
import { personaById, personas } from '@fastlane/content/sim';
import { createEngine, type GameState } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { idleBot, personaBot, randomBot } from './bots/policies.ts';
import { type Bot, playGame } from './game.ts';

const engine = createEngine(defaultContent);
const setupFor = (seed: string) => ({
  seed,
  players: [{ name: 'Bot', controller: 'human' as const }],
  config: { weekLimit: 26 },
});
const score = (state: GameState) =>
  state.phase.kind === 'gameOver' ? (state.phase.result.scores.p1 ?? 0) : 0;
const play = (bot: (seed: string) => Bot, seed: string) =>
  playGame(engine, setupFor(seed), [bot(seed)]);

describe('bots', () => {
  it('ships valid personas, including the reference balanced one', () => {
    expect(personas.map((p) => p.id)).toContain('balanced');
  });

  it('idle play survives to the week limit (FR-14 floor)', () => {
    const { state } = play(() => idleBot, 'idle');
    expect(state.phase).toMatchObject({
      kind: 'gameOver',
      result: { reason: 'weekLimit', week: 26 },
    });
  });

  it('balanced beats random play on the same seeds', () => {
    const balanced = personaById('balanced');
    for (const seed of ['b-1', 'b-2']) {
      const smart = score(play((s) => personaBot(defaultContent, balanced, s), seed).state);
      const random = score(play(randomBot, seed).state);
      expect(smart).toBeGreaterThan(random);
    }
  });
});
