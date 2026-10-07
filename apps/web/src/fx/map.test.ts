import type { DomainEvent } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { fxFor, isFirstWage, MAX_COINS } from './map.ts';

const step = { kind: 'action' as const };
const stat = (player: string, s: string, from: number, to: number): DomainEvent =>
  ({ type: 'statChanged', player, stat: s, from, to, cause: step }) as DomainEvent;
const pay = (player: string, amount: number, reason = 'wage'): DomainEvent =>
  ({
    type: 'moneyMoved',
    player,
    from: 'outside',
    to: 'cash',
    amount,
    reason,
    cause: step,
  }) as DomainEvent;
const job = (player: string, change: string): DomainEvent =>
  ({ type: 'jobChanged', player, change, job: 'cashier' }) as DomainEvent;

describe('fxFor', () => {
  it('pops cash first, then the other stats, net per stat', () => {
    const fx = fxFor(
      [stat('p1', 'energy', 50, 40), stat('p1', 'cash', 0, 9000), stat('p1', 'energy', 40, 45)],
      'p1',
    );
    expect(fx.pops.map((p) => [p.stat, p.delta, p.tone])).toEqual([
      ['cash', 9000, 'good'],
      ['energy', -5, 'bad'],
    ]);
  });

  it("ignores other players' events", () => {
    expect(fxFor([stat('p2', 'cash', 0, 100), pay('p2', 100)], 'p1')).toEqual({
      pops: [],
      coins: 0,
      shake: 'none',
      moment: null,
    });
  });

  it('bursts coins for income, scaled and capped', () => {
    expect(fxFor([pay('p1', 100)], 'p1').coins).toBe(3);
    expect(fxFor([pay('p1', 10_000)], 'p1').coins).toBe(5);
    expect(fxFor([pay('p1', 10_000_000)], 'p1').coins).toBe(MAX_COINS);
    expect(fxFor([pay('p1', 10_000, 'withdraw')], 'p1').coins).toBe(0);
  });

  it('shakes for big moments and keeps the strongest', () => {
    expect(fxFor([job('p1', 'hired')], 'p1')).toMatchObject({
      shake: 'light',
      moment: { kind: 'hired', job: 'cashier' },
    });
    expect(fxFor([job('p1', 'promoted')], 'p1').shake).toBe('big');
    expect(fxFor([job('p1', 'laidOff'), job('p1', 'hired')], 'p1').shake).toBe('big');
    expect(fxFor([job('p1', 'hoursCut')], 'p1')).toMatchObject({ shake: 'none', moment: null });
  });

  it('celebrates the first paycheck only when asked', () => {
    expect(fxFor([pay('p1', 8000)], 'p1').moment).toBeNull();
    expect(fxFor([pay('p1', 8000)], 'p1', { firstPay: true }).moment).toEqual({
      kind: 'paid',
      amount: 8000,
    });
  });
});

describe('isFirstWage', () => {
  it('needs a wage and no earlier one', () => {
    expect(isFirstWage([pay('p1', 1)], 'p1', false)).toBe(true);
    expect(isFirstWage([pay('p1', 1)], 'p1', true)).toBe(false);
    expect(isFirstWage([pay('p1', 1, 'gig')], 'p1', false)).toBe(false);
    expect(isFirstWage([pay('p2', 1)], 'p1', false)).toBe(false);
  });
});
