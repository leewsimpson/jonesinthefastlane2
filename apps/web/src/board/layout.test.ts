import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  boardLayout,
  buildingBox,
  feedbackPoint,
  innerRect,
  loopDelta,
  pointAt,
  siteAt,
  stepToward,
  townPlan,
} from './layout.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('board layout', () => {
  it('lines a wide board with rows of buildings, one per side, starting top left', () => {
    const layout = boardLayout(1060, 830, 10);
    const sides = layout.sites.map((s) => s.side);
    expect(sides).toEqual([...Array(4).fill('top'), 'right', ...Array(4).fill('bottom'), 'left']);
    const first = siteAt(layout, 0);
    for (let i = 1; i < 10; i++) {
      expect(siteAt(layout, i).x).toBeGreaterThanOrEqual(first.x - 1e-9);
      expect(siteAt(layout, i).y).toBeGreaterThanOrEqual(first.y - 1e-9);
    }
  });

  it('stacks a tall board in columns, one building at the top and bottom', () => {
    const layout = boardLayout(393, 600, 10);
    expect(layout.sites.map((s) => s.side)).toEqual([
      'top',
      ...Array(4).fill('right'),
      'bottom',
      ...Array(4).fill('left'),
    ]);
    expect(siteAt(layout, 0).x).toBeCloseTo(393 / 2);
  });

  it('keeps stops in loop order, each near its building', () => {
    for (const [w, h] of [
      [1060, 830],
      [930, 590],
      [393, 600],
      [1920, 1080],
      [800, 300],
    ] as const) {
      const layout = boardLayout(w, h, 10);
      for (let i = 1; i < 10; i++)
        expect(layout.stops[i]).toBeGreaterThan(layout.stops[i - 1] as number);
      expect((layout.stops[9] as number) - (layout.stops[0] as number)).toBeLessThan(layout.length);
      for (let i = 0; i < 10; i++) {
        const b = buildingBox(layout, i);
        const p = pointAt(layout, i);
        const dx = Math.max(b.l - p.x, 0, p.x - b.r);
        const dy = Math.max(b.t - p.y, 0, p.y - b.b);
        expect(Math.hypot(dx, dy)).toBeLessThan(layout.cell * 0.8);
      }
    }
  });

  it('keeps every building on the board', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 2000 }),
        fc.integer({ min: 400, max: 2000 }),
        fc.integer({ min: 0, max: 9 }),
        (w, h, i) => {
          const b = buildingBox(boardLayout(w, h, 10), i);
          return b.l >= 0 && b.r <= w && b.t >= 0 && b.b <= h;
        },
      ),
    );
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

describe('innerRect', () => {
  it('stays inside the loop, clear of every building, and leaves real room on common boards', () => {
    for (const [w, h, minW, minH] of [
      [630, 800, 150, 250],
      [590, 720, 150, 250],
      [1060, 830, 400, 170],
      // A big board grows the buildings, not the park: the square stays about a building tall (art-direction §4).
      [1920, 1080, 800, 200],
      [393, 330, 0, 0],
    ] as const) {
      const layout = boardLayout(w, h, 10);
      const r = innerRect(layout);
      expect(r.w).toBeGreaterThanOrEqual(minW);
      expect(r.h).toBeGreaterThanOrEqual(minH);
      if (minH > 0) expect(r.h).toBeGreaterThanOrEqual(layout.cell * 0.78 - 1e-6);
      for (let i = 0; i < 10; i++) {
        const b = buildingBox(layout, i);
        const clear = b.r <= r.x || b.l >= r.x + r.w || b.b <= r.y || b.t >= r.y + r.h;
        expect(clear).toBe(true);
      }
    }
  });
});

describe('feedbackPoint', () => {
  it('sits above its building and stays on the board', () => {
    const layout = boardLayout(800, 500, 10);
    for (let i = 0; i < 10; i++) {
      const f = feedbackPoint(layout, i);
      expect(f.y).toBeLessThan(siteAt(layout, i).y);
      expect(f.y).toBeGreaterThan(0);
      expect(f.x).toBeCloseTo(siteAt(layout, i).x);
    }
  });
});

describe('big boards', () => {
  it('grow the town with the board, so the park stays about a building tall', () => {
    for (const [w, h] of [
      [1410, 891],
      [2340, 1420],
      [2900, 1780],
    ] as const) {
      const layout = boardLayout(w, h, 10);
      const r = innerRect(layout);
      expect(r.h / h).toBeLessThan(0.27);
      expect(r.h).toBeLessThan(layout.cell * 1.1);
    }
  });
});

describe('townPlan', () => {
  const sizes = [
    [1060, 830],
    [393, 600],
    [1920, 1080],
  ] as const;
  const overlap = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) =>
    a.x < b.x + b.w - 1e-6 &&
    b.x < a.x + a.w - 1e-6 &&
    a.y < b.y + b.h - 1e-6 &&
    b.y < a.y + a.h - 1e-6;

  it('stands every building on a plot, with no blocks overlapping or on the ring road', () => {
    for (const [w, h] of sizes) {
      const layout = boardLayout(w, h, 10);
      const { blocks } = townPlan(layout);
      for (const [i, a] of blocks.entries())
        for (const b of blocks.slice(i + 1)) expect(overlap(a, b)).toBe(false);
      for (let i = 0; i < 10; i++) {
        const box = buildingBox(layout, i);
        const mid = { x: (box.l + box.r) / 2, y: box.b - 1 };
        const on = blocks.find(
          (b) =>
            b.kind === 'plot' &&
            mid.x >= b.x &&
            mid.x <= b.x + b.w &&
            mid.y >= b.y &&
            mid.y <= b.y + b.h + 12,
        );
        expect(on).toBeDefined();
      }
      // The ring road's centre line is tarmac all the way round.
      for (let k = 0; k < 200; k++) {
        const p = pointAt(layout, (k / 200) * 10);
        for (const b of blocks)
          expect(p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h).toBe(false);
      }
    }
  });

  it('runs side streets from the ring to the edge, clear of every building front', () => {
    for (const [w, h] of sizes) {
      const layout = boardLayout(w, h, 10);
      const { streets } = townPlan(layout);
      expect(streets.length).toBeGreaterThanOrEqual(4);
      for (const s of streets) {
        expect(
          s.x <= 0 || s.y <= layout.sky || s.x + s.w >= w - 1e-6 || s.y + s.h >= h - 1e-6,
        ).toBe(true);
        for (let i = 0; i < 10; i++) {
          const b = buildingBox(layout, i);
          // A street may pass behind a building's roof (the art stands over it), never its front.
          const front = b.t + (b.b - b.t) * 0.3;
          expect(overlap({ x: b.l, y: front, w: b.r - b.l, h: b.b - front - 1 }, s)).toBe(false);
        }
      }
    }
  });
});
