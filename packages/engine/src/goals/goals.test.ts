import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, player } from '../__fixtures__/play.ts';
import { newJobState } from '../jobs/jobs.ts';
import {
  careerValue,
  goalValues,
  netWorth,
  overshootBp,
  progressBp,
  scoreBp,
  skillsValue,
  wellbeing,
} from './goals.ts';

const { start, play, engine } = harness();
const c = fixtureContent;

describe('goal values (§3)', () => {
  it('counts net worth with items at resale value and debt against it', () => {
    const p = player(
      edit(start(), (q) => {
        q.stats.cash = 1000;
        q.holdings.savings = 500;
        q.holdings.fund = 200;
        q.housing.deposit = 300;
        q.items = ['bike']; // 800 at 50% → 400
        q.debts.card.balance = 250;
        q.debts.arrears.balance = 50;
      }),
    );
    expect(netWorth(c, p)).toBe(1000 + 500 + 200 + 300 + 400 - 250 - 50);
  });

  it('drags Wellbeing down when one part lags', () => {
    const even = player(
      edit(start(), (q) => Object.assign(q.stats, { happiness: 60, health: 60, social: 60 })),
    );
    const lopsided = player(
      edit(start(), (q) => Object.assign(q.stats, { happiness: 90, health: 60, social: 30 })),
    );
    expect(wellbeing(c, even)).toBe(60);
    // Mean 60, lowest 30: 60 − 50% × 30.
    expect(wellbeing(c, lopsided)).toBe(45);
  });

  it('adds credential points to skill points per track', () => {
    const p = player(
      edit(start(), (q) => {
        q.credentials = ['cert', 'degree'];
        q.trackMinutes = { tech: 240, craft: 60 };
      }),
    );
    expect(skillsValue(c, p)).toBe(10 + 20 + 2 + 1);
  });

  it('scores Career as level × stability, so exposed jobs count for less', () => {
    const clerk = player(
      edit(start(), (q) => {
        q.job = newJobState(c, 'clerk');
      }),
    );
    const manager = player(
      edit(start(), (q) => {
        q.job = newJobState(c, 'manager');
      }),
    );
    // Clerk: 20 × (1 − 50% × ½); manager: 40 × (1 − 20% × ½).
    expect(careerValue(c, clerk)).toBe(15);
    expect(careerValue(c, manager)).toBe(36);
    expect(careerValue(c, player(start()))).toBe(0);
  });

  it('caps progress at 100% for the score but keeps the overshoot for tiebreaks', () => {
    const targets = { wealth: 1000, wellbeing: 50, skills: 10, career: 10 };
    const values = { wealth: 3000, wellbeing: 25, skills: 10, career: 0 };
    expect(progressBp(values, targets)).toEqual({
      wealth: 10_000,
      wellbeing: 5000,
      skills: 10_000,
      career: 0,
    });
    expect(scoreBp(progressBp(values, targets))).toBe(6250);
    expect(overshootBp(values, targets)).toBe(20_000 - 5000 + 0 - 10_000);
  });
});

describe('win check (FR-11, FR-12)', () => {
  const easy = { wealth: 1000, wellbeing: 10, skills: 1, career: 1 };

  it('ends the game at the round end when a player meets every target', () => {
    const ready = edit(
      start({ seed: 's', players: [human('Ada')], config: { goals: easy } }),
      (p) => {
        p.job = newJobState(c, 'clerk');
        p.credentials = ['cert'];
        p.location = 'c';
      },
    );
    expect(ready.config.difficulty).toBe('custom');
    const { state, events } = play(
      ready,
      { type: 'perform', actionId: 'work-c', minutes: 60 },
      endWeek,
    );
    expect(state.phase).toMatchObject({
      kind: 'gameOver',
      result: { reason: 'win', winner: 'p1', week: 1 },
    });
    expect(eventsOf(events, 'gameOver')).toHaveLength(1);
  });

  it('checks after everyone has played, and the biggest overshoot wins', () => {
    const setup = { seed: 's', players: [human('Ada'), human('Bo')], config: { goals: easy } };
    const qualify = (s: ReturnType<typeof start>, i: number, cash: number) =>
      edit(
        s,
        (p) => {
          p.job = newJobState(c, 'clerk');
          p.credentials = ['cert'];
          p.stats.cash = cash;
        },
        i,
      );
    const both = qualify(qualify(start(setup), 0, 2000), 1, 5000);
    const afterAda = play(both, endWeek).state;
    expect(afterAda.phase).toEqual({ kind: 'turn', player: 'p2' });
    const { state } = play(afterAda, endWeek);
    expect(state.phase).toMatchObject({ result: { reason: 'win', winner: 'p2' } });
  });

  it('picks presets by difficulty and reports scores at the week limit', () => {
    const chill = start({
      seed: 's',
      players: [human('Ada')],
      config: { difficulty: 'chill', weekLimit: 1 },
    });
    expect(chill.config.goals).toEqual(c.balance.goals.presets.chill);
    const { state } = play(chill, endWeek);
    expect(state.phase).toMatchObject({ result: { reason: 'weekLimit', winner: 'p1' } });
    const values = goalValues(c, player(state));
    if (state.phase.kind !== 'gameOver') throw new Error('expected game over');
    expect(state.phase.result.scores.p1).toBe(scoreBp(progressBp(values, chill.config.goals)));
    expect(engine.listActions(state)).toEqual([]);
  });
});
