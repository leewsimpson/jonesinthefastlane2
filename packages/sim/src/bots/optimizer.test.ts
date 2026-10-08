import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { playGame } from '../game.ts';
import { setupFor } from '../runner/record.ts';
import { optimizerBot } from './optimizer.ts';

describe('optimizer (SIM-09)', () => {
  it('plays a legal, replayable game and logs leads with a positive gain', () => {
    const engine = createEngine(defaultContent);
    const setup = setupFor(
      { id: 'opt', bots: ['optimizer'], jones: 'standard', difficulty: 'standard', weekLimit: 6 },
      'opt-test',
    );
    const bot = optimizerBot(defaultContent, 'opt-test', {
      base: 'balanced',
      candidates: 2,
      rollouts: 1,
      horizonWeeks: 2,
    });
    const { state, log } = playGame(engine, setup, [bot]);
    expect(state.phase.kind).toBe('gameOver');
    expect(engine.hash(engine.replay(setup, log))).toBe(engine.hash(state));
    for (const lead of bot.leads) {
      expect(lead.gainBp).toBeGreaterThan(0);
      expect(lead.found).not.toBe(lead.instead);
    }
  });
});
