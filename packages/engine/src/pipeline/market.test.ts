import type { GameContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, perform, player } from '../__fixtures__/play.ts';

const { balance } = fixtureContent;
const withBalance = (patch: Partial<GameContent['balance']>): GameContent => ({
  ...fixtureContent,
  balance: { ...balance, ...patch },
});

describe('market (FR-53, FR-55)', () => {
  const rising = withBalance({
    market: {
      ...balance.market,
      regimes: [
        {
          id: 'flat',
          weight: 1,
          weeks: { min: 4, max: 4 },
          returnsBp: { fund: { min: 1000, max: 1000 } },
        },
      ],
    },
  });

  it('moves every holding by the round return, the same for every player (FR-05a)', () => {
    const h = harness(rising);
    const setup = { seed: 's', players: [human('Ada'), human('Bo')] };
    const invested = (i: number) => (s: ReturnType<typeof h.start>) =>
      edit(
        s,
        (p) => {
          p.stats.cash -= 1000;
          p.holdings.fund = 1000;
        },
        i,
      );
    const state = invested(1)(invested(0)(h.start(setup)));
    const { state: after, events } = h.play(state, endWeek, endWeek);
    expect(after.players.map((p) => p.holdings.fund)).toEqual([1100, 1100]);
    expect(eventsOf(events, 'marketMoved')).toEqual([
      {
        type: 'marketMoved',
        week: 1,
        regime: 'flat',
        returnsBp: { fund: 1000 },
        priceIndexBp: 10_000,
        wageIndexBp: 10_000,
      },
    ]);
  });

  it('crashes an asset on its crash roll (crypto rug-pulls)', () => {
    const h = harness(
      withBalance({
        market: {
          ...rising.balance.market,
          assets: [{ id: 'fund', crashChanceBp: 10_000, crashBp: -9000 }],
        },
      }),
    );
    const state = edit(h.start(), (p) => {
      p.stats.cash -= 1000;
      p.holdings.fund = 1000;
    });
    expect(player(h.play(state, endWeek).state).holdings.fund).toBe(100);
  });

  it('switches regime when the current one runs out', () => {
    const h = harness(
      withBalance({
        market: {
          ...balance.market,
          regimes: [
            {
              id: 'flat',
              weight: 0,
              weeks: { min: 1, max: 1 },
              returnsBp: { fund: { min: 0, max: 0 } },
            },
            {
              id: 'boom',
              weight: 1,
              weeks: { min: 3, max: 3 },
              returnsBp: { fund: { min: 0, max: 0 } },
            },
          ],
        },
      }),
    );
    const { state } = h.play(h.start(), endWeek);
    expect(state.world).toMatchObject({ regime: 'boom', regimeWeeksLeft: 3 });
  });
});

describe('inflation (FR-50)', () => {
  const h = harness(
    withBalance({ inflation: { weeklyDriftBp: { min: 100, max: 100 }, wageCatchUpBp: 5000 } }),
  );

  it('drifts prices each week and lets wages close part of the gap', () => {
    const { state } = h.play(h.start(), endWeek);
    expect(state.world).toMatchObject({ priceIndexBp: 10_100, wageIndexBp: 10_050 });
    const atB = edit(state, (p) => {
      p.location = 'b';
    });
    // The 400 snack now costs 404, rounded to the nearest 5 cents (FR-50).
    expect(h.engine.preview(atB, perform('snack'))).toMatchObject({ plan: { money: 405 } });
  });
});

describe('job openings', () => {
  it('rolls openings each round on the world stream; entry jobs are always open', () => {
    const h = harness();
    const { state } = h.play(h.start(), endWeek);
    expect(state.world.openings).toEqual(['clerk']);
  });
});
