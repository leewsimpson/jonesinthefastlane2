import { describe, expect, it } from 'vitest';
import { alphaBounds, findGutter, gridCells } from './bounds.ts';

function canvas(width: number, height: number) {
  const px = new Uint8Array(width * height * 4);
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) px[(j * width + i) * 4 + 3] = 255;
    }
  };
  return { px, fill };
}

describe('alphaBounds', () => {
  it('returns the tight box around the art', () => {
    const { px, fill } = canvas(40, 30);
    fill(5, 7, 10, 12);
    expect(alphaBounds(px, 40, { x: 0, y: 0, width: 40, height: 30 })).toEqual({
      x: 5,
      y: 7,
      width: 10,
      height: 12,
    });
  });

  it('ignores a stray single-pixel speck', () => {
    const { px, fill } = canvas(40, 30);
    fill(5, 7, 10, 12);
    fill(38, 1, 1, 1);
    expect(alphaBounds(px, 40, { x: 0, y: 0, width: 40, height: 30 })).toMatchObject({
      x: 5,
      width: 10,
    });
  });

  it('returns null for an empty region', () => {
    const { px } = canvas(10, 10);
    expect(alphaBounds(px, 10, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('findGutter', () => {
  it('picks the middle of the emptiest run', () => {
    expect(findGutter([5, 3, 0, 0, 0, 0, 2, 4], 0, 8)).toBe(3);
  });
});

describe('gridCells', () => {
  it('snaps cuts to the real gutters of an uneven 3 × 2 sheet', () => {
    const { px, fill } = canvas(90, 60);
    // Columns of art at 2–30, 36–58 and 64–88: the gutters sit off the nominal 30 and 60 lines.
    for (const [x, w] of [
      [2, 28],
      [36, 22],
      [64, 24],
    ] as const) {
      fill(x, 2, w, 24);
      fill(x, 34, w, 24);
    }
    const cells = gridCells(px, 90, 60, 3, 2);
    expect(cells).toHaveLength(6);
    expect(cells.map((c) => c.x)).toEqual([0, 32, 60, 0, 32, 60]);
    for (const cell of cells) {
      const box = alphaBounds(px, 90, cell);
      expect(box?.height).toBe(24);
    }
  });
});
