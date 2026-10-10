import { describe, expect, it } from 'vitest';
import { money, signedMoney } from './format.ts';

describe('money (NFR-06)', () => {
  it('shows whole dollars, rounded half up', () => {
    expect(money(230560)).toBe('$2,306');
    expect(money(35030)).toBe('$350');
    expect(money(15026)).toBe('$150');
    expect(money(1050)).toBe('$11');
    expect(money(1049)).toBe('$10');
    expect(money(0)).toBe('$0');
  });

  it('keeps cents only for fractional amounts under $10', () => {
    expect(money(401)).toBe('$4.01');
    expect(money(999)).toBe('$9.99');
    expect(money(300)).toBe('$3');
    expect(money(1000)).toBe('$10');
  });

  it('signs negatives with a real minus', () => {
    expect(money(-35030)).toBe('−$350');
    expect(signedMoney(-1200)).toBe('−$12');
    expect(signedMoney(4000)).toBe('+$40');
  });
});
