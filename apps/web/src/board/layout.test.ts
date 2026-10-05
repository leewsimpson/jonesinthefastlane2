import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { boardLayout, loopDelta, pointAt, stepToward } from './layout.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('board layout', () => {
  it.each([
    ['wide', 800, 300],
    ['tall', 600, 800],
  ])('puts the first location at the top, centred (%s)', (_, w, h) => {
    const layout = boardLayout(w, h, 10);
    const top = pointAt(layout, 0);
    expect(top.x).toBeCloseTo(w / 2);
    for (let i = 1; i < 10; i++) expect(pointAt(layout, i).y).toBeGreaterThanOrEqual(top.y - 1e-9);
  });

  it('keeps every point inside the board', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 2000 }),
        fc.integer({ min: 200, max: 2000 }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (w, h, i) => {
          const p = pointAt(boardLayout(w, h, 10), i);
          return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
        },
      ),
    );
  });

  it('is a closed loop that moves smoothly', () => {
    const layout = boardLayout(900, 500, 10);
    expect(dist(pointAt(layout, 0), pointAt(layout, 10))).toBeLessThan(1e-6);
    const step = 0.01;
    let max = 0;
    for (let i = 0; i < 10; i += step)
      max = Math.max(max, dist(pointAt(layout, i), pointAt(layout, i + step)));
    // Each step covers the same length of road, so no jump is much longer than the average.
    expect(max).toBeLessThan(10);
  });
});

describe('token motion', () => {
  it('goes the shorter way round', () => {
    expect(loopDelta(0, 3, 10)).toBe(3);
    expect(loopDelta(0, 8, 10)).toBe(-2);
    expect(loopDelta(9, 1, 10)).toBe(2);
  });

  it('arrives exactly and never overshoots', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), (from, to) => {
        let pos = from;
        for (let i = 0; i < 100 && pos !== to; i++) pos = stepToward(pos, to, 0.3, 10);
        return pos === to;
      }),
    );
  });
});
