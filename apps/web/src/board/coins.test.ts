import { describe, expect, it } from 'vitest';
import { launch } from './coins.ts';

describe('launch', () => {
  it('fans coins upwards, deterministically', () => {
    const v = launch(5);
    expect(v).toHaveLength(5);
    for (const { vy } of v) expect(vy).toBeLessThan(0);
    expect(v[0]?.vx).toBeLessThan(0);
    expect(v[4]?.vx).toBeGreaterThan(0);
    expect(launch(5)).toEqual(v);
    expect(launch(1)[0]?.vx).toBeCloseTo(0);
  });
});
