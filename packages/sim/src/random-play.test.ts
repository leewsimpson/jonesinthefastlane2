import { defaultContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { randomPlay } from './random-play.ts';

describe('random play (Phase 1 exit criterion)', () => {
  it('plays 52 weeks of random legal actions and replays to an identical state hash', () => {
    for (let g = 0; g < 5; g++) {
      const setup = {
        seed: `exit-${g}`,
        players: [
          { name: 'Ada', kind: 'human' as const },
          { name: 'Jones', kind: 'ai' as const },
        ],
      };
      const result = randomPlay(defaultContent, setup, 52, g);
      expect(result.state.week).toBe(53);
      expect(result.replayHash).toBe(result.hash);
    }
  });

  it('is deterministic across runs', () => {
    const setup = { seed: 'same', players: [{ name: 'Ada', kind: 'human' as const }] };
    expect(randomPlay(defaultContent, setup, 10, 1).hash).toBe(
      randomPlay(defaultContent, setup, 10, 1).hash,
    );
  });
});
