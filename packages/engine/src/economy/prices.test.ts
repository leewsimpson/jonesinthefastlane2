import { describe, expect, it } from 'vitest';
import type { WorldState } from '../types/state.ts';
import { price, roundPrice } from './prices.ts';

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
    expect(price(at(11_000), 2500)).toBe(2800);
  });

  it('rounds to whole dollars from $10 up, so no stray cents on rent or tuition', () => {
    expect(price(at(10_010), 35_000)).toBe(35_000);
    expect(price(at(10_010), 15_000)).toBe(15_000);
    expect(price(at(10_500), 15_000)).toBe(15_800);
    expect(price(at(10_500), 35_000) % 100).toBe(0);
  });

  it('keeps nickel steps below $10', () => {
    expect(roundPrice(401)).toBe(400);
    expect(roundPrice(603)).toBe(605);
    expect(roundPrice(999)).toBe(1000);
  });
});
