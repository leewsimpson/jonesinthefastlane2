import { describe, expect, it } from 'vitest';
import type { WorldState } from '../types/state.ts';
import { price } from './prices.ts';

const at = (priceIndexBp: number) => ({ priceIndexBp }) as WorldState;

describe('price (FR-50)', () => {
  it('is unchanged at the launch-day index', () => {
    expect(price(at(10_000), 2500)).toBe(2500);
  });

  it('never shows a stray cent: tiny inflation rounds to the nearest 5 cents', () => {
    expect(price(at(10_003), 2500)).toBe(2500);
    expect(price(at(10_050), 2500) % 5).toBe(0);
  });

  it('still moves once inflation is big enough to matter', () => {
    expect(price(at(11_000), 2500)).toBe(2750);
  });
});
