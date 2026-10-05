import { defaultContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { randomPlay } from './random-play.ts';

describe('random play (Phase 1 exit criterion)', () => {
  it('plays 52 weeks of random legal actions and replays to an identical state hash', () => {
    for (let g = 0; g < 5; g++) {
      const setup = {
        seed: `exit-${g}`,
        players: [
          { name: 'Ada', controller: 'human' as const },
          { name: 'Jones', controller: 'ai' as const },
        ],
        config: { weekLimit: 52 },
      };
      const result = randomPlay(defaultContent, setup, `chooser-${g}`);
      expect(result.state.phase).toMatchObject({
        kind: 'gameOver',
        result: { reason: 'weekLimit', week: 52 },
      });
      expect(result.replayHash).toBe(result.hash);
    }
  });

  it('is deterministic across runs', () => {
    const setup = {
      seed: 'same',
      players: [{ name: 'Ada', controller: 'human' as const }],
      config: { weekLimit: 10 },
    };
    expect(randomPlay(defaultContent, setup, 'c').hash).toBe(
      randomPlay(defaultContent, setup, 'c').hash,
    );
  });
});
