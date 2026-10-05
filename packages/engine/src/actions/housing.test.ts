import { describe, expect, it } from 'vitest';
import { edit, endWeek, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';

const { engine, start, play, reason } = harness();
const atLeaseLord = () =>
  edit(start(), (p) => {
    p.location = 'e';
  });
const lease = (target: string) => perform('lease', { target });

describe('housing (FR-51, FR-14)', () => {
  it('needs a credit check and pays the deposit', () => {
    expect(reason(atLeaseLord(), lease('loft'))).toBe('CREDIT_CHECK');
    expect(reason(atLeaseLord(), lease('couch'))).toBe('ALREADY_THERE');
    const { state, events } = play(atLeaseLord(), lease('flat'));
    expect(player(state).housing).toEqual({
      tier: 'flat',
      rent: 300,
      leaseWeeksLeft: 2,
      deposit: 600,
      missedRent: 0,
    });
    expect(player(state).stats.cash).toBe(1400);
    expect(eventsOf(events, 'moved')).toEqual([
      { type: 'moved', player: 'p1', from: 'couch', to: 'flat', rent: 300 },
    ]);
  });

  it('charges rent weekly and renews the lease with a hike', () => {
    const leased = play(atLeaseLord(), lease('flat')).state;
    const week1 = play(leased, endWeek);
    expect(player(week1.state).stats.cash).toBe(1100);
    const week2 = play(week1.state, endWeek);
    expect(eventsOf(week2.events, 'leaseRenewed')).toEqual([
      { type: 'leaseRenewed', player: 'p1', from: 300, to: 330 },
    ]);
    expect(player(week2.state).housing).toMatchObject({ rent: 330, leaseWeeksLeft: 2 });
  });

  it('turns unpaid rent into arrears, then evicts to the free tier (FR-14)', () => {
    const leased = edit(play(atLeaseLord(), lease('flat')).state, (p) => {
      p.stats.cash = 0;
    });
    const missed = play(leased, endWeek);
    expect(eventsOf(missed.events, 'rentMissed')).toEqual([
      { type: 'rentMissed', player: 'p1', owed: 300, missed: 1 },
    ]);
    expect(player(missed.state).debts.arrears.balance).toBe(300);
    expect(player(missed.state).stats.creditScore).toBe(580);
    expect(
      reason(
        edit(missed.state, (p) => {
          p.location = 'e';
        }),
        lease('couch'),
      ),
    ).toBe('RENT_OWED');

    const evicted = play(missed.state, endWeek);
    expect(eventsOf(evicted.events, 'evicted')).toEqual([
      { type: 'evicted', player: 'p1', from: 'flat' },
    ]);
    // The 600 deposit clears the 600 of arrears.
    expect(player(evicted.state).housing).toMatchObject({ tier: 'couch', rent: 0, deposit: 0 });
    expect(player(evicted.state).debts.arrears.balance).toBe(0);
  });

  it('returns the old deposit when moving', () => {
    const leased = play(atLeaseLord(), lease('flat')).state;
    const back = play(leased, lease('couch')).state;
    expect(player(back).stats.cash).toBe(2000);
    expect(player(back).housing).toMatchObject({ tier: 'couch', deposit: 0, rent: 0 });
  });

  it('counts the old deposit toward the new one, and shows both moves (FR-03)', () => {
    const leased = play(atLeaseLord(), lease('flat')).state;
    // The loft's 1800 deposit less the flat's 600 refund: 1200 has to be in cash.
    const short = edit(leased, (p) => {
      p.stats.creditScore = 750;
      p.stats.cash = 1200;
    });
    const preview = engine.preview(short, lease('loft'));
    expect(preview).toMatchObject({
      available: true,
      plan: {
        money: 1200,
        transfers: [
          { from: 'deposit', to: 'cash', amount: 600 },
          { from: 'cash', to: 'deposit', amount: 1800 },
        ],
      },
    });
    const moved = play(short, lease('loft')).state;
    expect(player(moved).stats.cash).toBe(0);
    expect(player(moved).housing).toMatchObject({ tier: 'loft', deposit: 1800 });
    expect(
      reason(
        edit(short, (p) => (p.stats.cash = 1199)),
        lease('loft'),
      ),
    ).toBe('NOT_ENOUGH_MONEY');
  });

  it('gates actions on housing tier, such as hosting friends (§16)', () => {
    expect(reason(start(), perform('host'))).toBe('NEEDS_HOUSING');
    const housed = edit(start(), (p) => {
      p.housing.tier = 'loft';
    });
    expect(reason(housed, perform('host'))).toBeNull();
  });
});
