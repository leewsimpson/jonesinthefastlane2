import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, nextUint32, type RngState, seedRng, streamSeed } from './rng.ts';

const take = (s: RngState, n: number) => Array.from({ length: n }, () => nextUint32(s));

describe('rng', () => {
  it('matches the xoshiro128** reference output', () => {
    expect(take([1, 2, 3, 4], 6)).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });

  it('is a fixed sequence for a given seed (saves and Daily Runs depend on it)', () => {
    // Pinned output: if this changes, every existing save and replay breaks.
    expect(take(seedRng(42), 4)).toMatchInlineSnapshot(`
      [
        2837322924,
        544945897,
        479756282,
        3500138142,
      ]
    `);
  });

  it('gives the same sequence for the same seed and stream', () => {
    expect(take(streamSeed('run', 'world'), 50)).toEqual(take(streamSeed('run', 'world'), 50));
  });

  it('splits streams so they are independent of each other', () => {
    expect(take(streamSeed('run', 'world'), 8)).not.toEqual(take(streamSeed('run', 'events'), 8));
    expect(take(streamSeed('run', 'world'), 8)).not.toEqual(take(streamSeed('nur', 'world'), 8));
  });

  it('keeps state words unsigned 32-bit so they serialise stably', () => {
    const s = seedRng(7);
    for (let i = 0; i < 1000; i++) nextUint32(s);
    for (const w of s) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(2 ** 32);
    }
  });

  it('draws floats in [0, 1) and integers inside the inclusive range', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: -50, max: 50 }),
        fc.nat(100),
        (seed, min, span) => {
          const s = seedRng(seed);
          const f = nextFloat(s);
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThan(1);
          const n = nextInt(s, min, min + span);
          expect(n).toBeGreaterThanOrEqual(min);
          expect(n).toBeLessThanOrEqual(min + span);
        },
      ),
    );
  });
});
