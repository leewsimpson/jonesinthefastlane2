import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../types/state.ts';
import { createRng, cyrb128, nextUint32, type RngState, rngFrom } from './rng.ts';
import { stream, streamKey } from './streams.ts';

const take = (s: RngState, n: number) => Array.from({ length: n }, () => nextUint32(s));

describe('rng', () => {
  it('matches the xoshiro128** reference output', () => {
    expect(take([1, 2, 3, 4], 6)).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });

  it('is a fixed sequence for a given key (saves and Daily Runs depend on it)', () => {
    // Pinned output: if this changes, every golden fixture and replay breaks. Bump ENGINE_VERSION.
    expect(take(cyrb128('run|world::1'), 4)).toMatchInlineSnapshot(`
      [
        1107723269,
        1373737188,
        3393808291,
        2407787569,
      ]
    `);
  });

  it('gives independent sequences for different keys', () => {
    expect(take(cyrb128('run|world::1'), 8)).toEqual(take(cyrb128('run|world::1'), 8));
    expect(take(cyrb128('run|world::1'), 8)).not.toEqual(take(cyrb128('run|events:p1:1'), 8));
    expect(take(cyrb128('run|world::1'), 8)).not.toEqual(take(cyrb128('run|world::2'), 8));
  });

  it('keeps state words unsigned 32-bit so they serialise stably', () => {
    const s = cyrb128('seven');
    for (let i = 0; i < 1000; i++) nextUint32(s);
    for (const w of s) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(0x1_0000_0000);
    }
  });

  it('draws integers inside the inclusive range', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: -50, max: 50 }), fc.nat(100), (key, min, span) => {
        const n = createRng(key).int(min, min + span);
        expect(n).toBeGreaterThanOrEqual(min);
        expect(n).toBeLessThanOrEqual(min + span);
      }),
    );
  });

  it('rejects ranges that would lose precision or make no sense', () => {
    const rng = createRng('x');
    expect(() => rng.int(0, 0x20_0000)).toThrow();
    expect(() => rng.int(5, 4)).toThrow();
    expect(() => rng.int(0, 1.5)).toThrow();
  });

  it('honours basis-point chances and integer weights at the edges', () => {
    const rng = createRng('edges');
    const items = [
      { weight: 0, value: 'a' },
      { weight: 3, value: 'b' },
    ];
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(10_000)).toBe(true);
      expect(rng.pick(items)).toBe('b');
    }
    expect(() => rng.pick([{ weight: 0, value: 'a' }])).toThrow();
  });
});

describe('streams', () => {
  const state = () => ({ seed: 'run', rng: {} }) as unknown as GameState;

  it('creates a stream from the run seed on first use and keeps its state', () => {
    const s = state();
    const first = stream(s, streamKey('events', 'p1', 3)).int(0, 1000);
    expect(Object.keys(s.rng)).toEqual(['events:p1:3']);
    expect(first).toBe(rngFrom(cyrb128('run|events:p1:3')).int(0, 1000));
    const fresh = rngFrom(cyrb128('run|events:p1:3'));
    fresh.int(0, 1000);
    expect(stream(s, 'events:p1:3').int(0, 1000)).toBe(fresh.int(0, 1000));
  });

  it('never advances one stream by drawing from another', () => {
    const a = state();
    const b = state();
    stream(b, streamKey('action', 'p1', 1)).int(0, 9);
    expect(stream(a, streamKey('world', '', 1)).int(0, 1_000_000)).toBe(
      stream(b, streamKey('world', '', 1)).int(0, 1_000_000),
    );
  });
});
