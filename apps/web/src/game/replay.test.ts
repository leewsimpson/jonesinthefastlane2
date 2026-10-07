import { describe, expect, it } from 'vitest';
import { ReplayFileSchema } from '../persistence/schema.ts';
import { engine } from './engine.ts';
import { replaySteps, stepOfWeek, viewer } from './replay.ts';

const setup = {
  seed: 'replay-1',
  players: [
    { name: 'Me', controller: 'human' as const },
    { name: 'Jones', controller: 'ai' as const },
  ],
  config: { weekLimit: 4 },
};

describe('debug replay (simulator §4)', () => {
  it('keeps a snapshot per action and finds where each week starts', () => {
    const log = [{ type: 'endWeek' as const }, { type: 'endWeek' as const }];
    const steps = replaySteps(engine, setup, log);
    expect(steps.error).toBeNull();
    expect(steps.states).toHaveLength(3);
    expect(steps.states[0]?.week).toBe(1);
    // End Week doesn't change earlier snapshots.
    expect(steps.states[0]?.week).not.toBe(steps.states.at(-1)?.week);
    expect(stepOfWeek(steps, 2)).toBeGreaterThan(0);
    expect(viewer(steps.states[0] as never)).toBe('p1');
  });

  it('stops before an illegal action and says which', () => {
    const steps = replaySteps(engine, setup, [
      { type: 'endWeek' },
      { type: 'travel', to: 'nowhere', mode: 'walk' },
    ]);
    expect(steps.error).toEqual({ index: 1, code: 'UNKNOWN_LOCATION' });
    expect(steps.states).toHaveLength(2);
  });

  it('accepts a sim export or a save file', () => {
    expect(ReplayFileSchema.safeParse({ setup, log: [] }).success).toBe(true);
    expect(
      ReplayFileSchema.safeParse({ format: 'fastlane-save', setup, log: [], snapshot: {} }).success,
    ).toBe(true);
    expect(ReplayFileSchema.safeParse({ log: [] }).success).toBe(false);
  });
});
