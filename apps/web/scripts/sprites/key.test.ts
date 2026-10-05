import { describe, expect, it } from 'vitest';
import { keyMagenta } from './key.ts';

const PALETTE = {
  ink: [0x1f, 0x1b, 0x2e],
  cream: [0xff, 0xf6, 0xe9],
  coral: [0xff, 0x5a, 0x4e],
  mustard: [0xff, 0xc2, 0x3d],
  teal: [0x1f, 0xb5, 0xa8],
  sky: [0x5e, 0xb8, 0xff],
  lilac: [0x8e, 0x7c, 0xf0],
  mint: [0x7e, 0xe0, 0xa1],
  blush: [0xff, 0xb3, 0xa7],
  slate: [0x5b, 0x58, 0x72],
  lightSkin: [0xf6, 0xd0, 0xb1],
  darkSkin: [0x5a, 0x3a, 0x22],
};

function keyed(rgb: number[]): number[] {
  const px = new Uint8Array([...rgb, 255]);
  keyMagenta(px);
  return [...px];
}

describe('keyMagenta', () => {
  it('clears pure and near-pure magenta', () => {
    expect(keyed([255, 0, 255])[3]).toBe(0);
    expect(keyed([246, 12, 240])[3]).toBe(0);
  });

  it('leaves every palette colour and skin tone untouched', () => {
    for (const [name, rgb] of Object.entries(PALETTE)) {
      expect(keyed(rgb), name).toEqual([...rgb, 255]);
    }
  });

  it('turns an ink/magenta edge blend into semi-transparent ink, with no magenta fringe', () => {
    const ink = PALETTE.ink;
    const key = [255, 0, 255];
    const blend = ink.map((c, i) => Math.round((c + (key[i] as number)) / 2));
    const [r = 0, g = 0, b = 0, a = 0] = keyed(blend);
    expect(a).toBeGreaterThan(90);
    expect(a).toBeLessThan(170);
    // The recovered colour is close to ink, not pink.
    expect(Math.abs(r - (ink[0] as number))).toBeLessThan(24);
    expect(Math.abs(g - (ink[1] as number))).toBeLessThan(24);
    expect(Math.abs(b - (ink[2] as number))).toBeLessThan(24);
  });
});
