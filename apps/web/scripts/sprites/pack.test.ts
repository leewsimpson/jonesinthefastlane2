import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Placement, pack } from './pack.ts';

function overlaps(a: Placement, b: Placement, padding: number): boolean {
  return (
    a.page === b.page &&
    a.x < b.x + b.width + padding &&
    b.x < a.x + a.width + padding &&
    a.y < b.y + b.height + padding &&
    b.y < a.y + a.height + padding
  );
}

describe('pack', () => {
  it('places every sprite inside its page with padding between neighbours', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            width: fc.integer({ min: 1, max: 300 }),
            height: fc.integer({ min: 1, max: 300 }),
          }),
          {
            maxLength: 60,
          },
        ),
        (sizes) => {
          const items = sizes.map((s, i) => ({ id: `s${i}`, ...s }));
          const { pages, placements } = pack(items, 512, 2);
          expect(placements).toHaveLength(items.length);
          for (const p of placements) {
            const page = pages[p.page] as { width: number; height: number };
            expect(p.x + p.width).toBeLessThanOrEqual(page.width);
            expect(p.y + p.height).toBeLessThanOrEqual(page.height);
            expect(page.width).toBeLessThanOrEqual(512);
            expect(page.height).toBeLessThanOrEqual(512);
          }
          for (let i = 0; i < placements.length; i++) {
            for (let j = i + 1; j < placements.length; j++) {
              expect(overlaps(placements[i] as Placement, placements[j] as Placement, 2)).toBe(
                false,
              );
            }
          }
        },
      ),
    );
  });

  it('opens a new page when one fills', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, width: 100, height: 100 }));
    expect(pack(items, 210, 2).pages).toHaveLength(2);
  });

  it('rejects a sprite larger than a page', () => {
    expect(() => pack([{ id: 'huge', width: 600, height: 10 }], 512)).toThrow(/huge/);
  });
});
