import { describe, expect, it } from 'vitest';
import { edit, endWeek, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';

const { engine, start, play, reason } = harness();
const atBank = () =>
  edit(start(), (p) => {
    p.location = 'b';
  });

describe('banking (FR-53)', () => {
  it('moves cash into savings and investments and back', () => {
    const { state, events } = play(
      atBank(),
      perform('deposit', { target: 'savings', amount: 1000 }),
      perform('deposit', { target: 'fund', amount: 500 }),
    );
    expect(player(state).holdings).toEqual({ savings: 1000, fund: 500 });
    expect(player(state).stats.cash).toBe(500);
    expect(eventsOf(events, 'moneyMoved')).toMatchObject([
      { from: 'cash', to: 'hold:savings', amount: 1000, reason: 'save' },
      { from: 'cash', to: 'hold:fund', amount: 500, reason: 'save' },
    ]);
    expect(reason(state, perform('withdraw', { target: 'fund', amount: 1000 }))).toBe('BAD_AMOUNT');
    const back = play(state, perform('withdraw', { target: 'fund', amount: 500 })).state;
    expect(player(back).holdings.fund).toBe(0);
    expect(player(back).stats.cash).toBe(1000);
  });

  it('offers amount presets and "all of it", and refuses bad amounts', () => {
    const deposits = engine
      .listActions(atBank())
      .map((o) => o.action)
      .filter((a) => a.type === 'perform' && a.actionId === 'deposit' && a.target === 'savings');
    expect(deposits.map((a) => (a.type === 'perform' ? a.amount : 0))).toEqual([500, 1000, 2000]);
    expect(reason(atBank(), perform('deposit', { target: 'savings', amount: 0 }))).toBe(
      'BAD_AMOUNT',
    );
    expect(reason(atBank(), perform('deposit', { target: 'savings', amount: 1.5 }))).toBe(
      'BAD_AMOUNT',
    );
    expect(reason(atBank(), perform('deposit', { target: 'gold', amount: 100 }))).toBe(
      'BAD_TARGET',
    );
    expect(reason(atBank(), perform('deposit', { target: 'savings', amount: 5000 }))).toBe(
      'NOT_ENOUGH_MONEY',
    );
  });

  it('pays savings interest at the end of the week', () => {
    const saved = play(atBank(), perform('deposit', { target: 'savings', amount: 1000 })).state;
    const { state, events } = play(saved, endWeek);
    expect(player(state).holdings.savings).toBe(1010);
    expect(eventsOf(events, 'moneyMoved')).toMatchObject([
      { from: 'outside', to: 'hold:savings', amount: 10, reason: 'interest' },
    ]);
  });
});

describe('debt (FR-54, FR-14)', () => {
  it('borrows on the card up to the credit limit', () => {
    const { state } = play(atBank(), perform('borrow', { amount: 1000 }));
    expect(player(state).debts.card.balance).toBe(1000);
    expect(player(state).stats.cash).toBe(3000);
    const maxed = edit(state, (p) => {
      p.debts.card.balance = 5000;
    });
    expect(reason(maxed, perform('borrow', { amount: 500 }))).toBe('OVER_LIMIT');
  });

  it('charges interest, takes the minimum payment and rewards paying on time', () => {
    const owing = play(atBank(), perform('borrow', { amount: 1000 })).state;
    const { state } = play(owing, endWeek);
    // 1000 + 2% = 1020; minimum = max(100, 10% of 1020) = 102.
    expect(player(state).debts.card).toEqual({ balance: 918, missed: 0, collections: false });
    expect(player(state).stats.creditScore).toBe(601);
  });

  it('repays a debt, never more than is owed', () => {
    const owing = play(atBank(), perform('borrow', { amount: 1000 })).state;
    expect(reason(owing, perform('repay', { target: 'student', amount: 500 }))).toBe('NO_DEBT');
    expect(reason(owing, perform('repay', { target: 'card', amount: 2000 }))).toBe('BAD_AMOUNT');
    const paid = play(owing, perform('repay', { target: 'card', amount: 1000 })).state;
    expect(player(paid).debts.card.balance).toBe(0);
  });

  it('turns missed payments into late fees, credit hits and then collections', () => {
    const broke = edit(start(), (p) => {
      p.stats.cash = 0;
      p.debts.card.balance = 1000;
    });
    const once = play(broke, endWeek);
    expect(eventsOf(once.events, 'paymentMissed')).toMatchObject([{ debt: 'card' }]);
    // 1000 + 20 interest + 50 late fee.
    expect(player(once.state).debts.card).toEqual({ balance: 1070, missed: 1, collections: false });
    expect(player(once.state).stats.creditScore).toBe(590);
    const twice = play(once.state, endWeek);
    expect(eventsOf(twice.events, 'collections')).toEqual([
      { type: 'collections', player: 'p1', debt: 'card' },
    ]);
    expect(player(twice.state).debts.card.collections).toBe(true);
    expect(player(twice.state).stats.creditScore).toBe(530);
  });
});
