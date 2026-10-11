import { describe, expect, it } from 'vitest';
import { boardLayout, parkCrossings, parkPlan, pointAt, townPlan } from './layout.ts';
import { scenery } from './scenery.ts';

const BOARDS = [
  [1062, 837],
  [935, 613],
  [1446, 893],
  [393, 600],
] as const;

const VEHICLES = new Set([
  'car-taxi',
  'car-sedan',
  'car-hatch',
  'van-delivery',
  'bus',
  'car-front',
]);

describe('park', () => {
  it('sets the plaza in the middle of the lawn, with room round it, on every board', () => {
    for (const [w, h] of BOARDS) {
      const layout = boardLayout(w, h, 10);
      const { bed, plaza } = parkPlan(layout);
      expect(plaza.x - plaza.rx).toBeGreaterThan(bed.x);
      expect(plaza.x + plaza.rx).toBeLessThan(bed.x + bed.w);
      expect(plaza.y - plaza.ry).toBeGreaterThan(bed.y);
      expect(plaza.y + plaza.ry).toBeLessThan(bed.y + bed.h);
    }
  });

  it('keeps the trees off the paths and the plaza', () => {
    for (const [w, h] of BOARDS) {
      const layout = boardLayout(w, h, 10);
      const { bed, path, plaza } = parkPlan(layout);
      const trees = scenery(layout, townPlan(layout)).filter(
        (p) =>
          p.frame.startsWith('tree') &&
          p.x > bed.x &&
          p.x < bed.x + bed.w &&
          p.y > bed.y &&
          p.y < bed.y + bed.h,
      );
      for (const t of trees) {
        expect(Math.abs(t.x - plaza.x)).toBeGreaterThan(path / 2);
        expect(Math.abs(t.y - plaza.y)).toBeGreaterThan(path / 2);
      }
    }
  });

  it('crosses the ring road where the park paths meet it', () => {
    for (const [w, h] of BOARDS) {
      const layout = boardLayout(w, h, 10);
      const { cx, cy, rx, ry } = layout;
      const crossings = parkCrossings(layout);
      expect(crossings).toHaveLength(4);
      for (const c of crossings) {
        if (c.traffic === 'h') expect([cy - ry, cy + ry]).toContain(c.y);
        else expect([cx - rx, cx + rx]).toContain(c.x);
      }
    }
  });
});

describe('traffic', () => {
  it('keeps vehicles on the board, clear of each other and of the stops', () => {
    for (const [w, h] of BOARDS) {
      const layout = boardLayout(w, h, 10);
      const cars = scenery(layout, townPlan(layout)).filter((p) => VEHICLES.has(p.frame));
      expect(cars.length).toBeGreaterThan(2);
      for (const car of cars) {
        expect(car.x).toBeGreaterThan(0);
        expect(car.x).toBeLessThan(w);
        expect(car.y).toBeLessThanOrEqual(h + 0.5);
        for (let i = 0; i < layout.count; i++) {
          const stop = pointAt(layout, i);
          expect(Math.hypot(stop.x - car.x, stop.y - (car.y - car.h / 2))).toBeGreaterThan(
            layout.token * 0.5,
          );
        }
      }
      for (const [i, a] of cars.entries())
        for (const b of cars.slice(i + 1))
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(layout.road);
    }
  });
});
