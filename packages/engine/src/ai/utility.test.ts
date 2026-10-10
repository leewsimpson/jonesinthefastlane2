import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, player } from '../__fixtures__/play.ts';
import { emptyPlan } from '../actions/plan.ts';
import { newJobState } from '../jobs/jobs.ts';
import type { ChoicePlan, Decision } from '../types/state.ts';
import { bandedPersona, scoreChoices, scoreLead, valuation } from './utility.ts';

const { engine, start, play } = harness();
const jones = { name: 'Jones', controller: 'ai' as const };
const [rival] = fixtureContent.ai.rivals;
if (!rival) throw new Error('fixture has a rival');

describe('Jones (FR-80, FR-83)', () => {
  it("plays the rival for the game's difficulty, or the persona the setup names", () => {
    const standard = start({ seed: 'j', players: [human('Ada'), jones] });
    expect(player(standard, 1).persona).toBe('jones');
    expect(player(standard, 0).persona).toBeNull();
    const chill = start({
      seed: 'j',
      players: [human('Ada'), jones],
      config: { difficulty: 'chill' },
    });
    expect(player(chill, 1).persona).toBe('jones-sloppy');
    const named = start({
      seed: 'j',
      players: [human('Ada'), { ...jones, persona: 'jones-sloppy' }],
    });
    expect(player(named, 1).persona).toBe('jones-sloppy');
    expect(() =>
      start({ seed: 'j', players: [human('Ada'), { ...jones, persona: 'nobody' }] }),
    ).toThrow(/unknown rival/);
  });

  it('plays real weeks under the same rules: it gets a job and earns', () => {
    const { events } = play(start({ seed: 'j', players: [human('Ada'), jones] }), endWeek, endWeek);
    expect(eventsOf(events, 'jobChanged')).toContainEqual(
      expect.objectContaining({ player: 'p2', change: 'hired' }),
    );
    const jonesActs = eventsOf(events, 'actionPerformed').filter((e) => e.player === 'p2');
    expect(jonesActs.length).toBeGreaterThan(0);
    const earned = eventsOf(events, 'moneyMoved').filter(
      (e) =>
        e.player === 'p2' &&
        e.from === 'outside' &&
        (e.reason === 'wage' || e.reason === 'gig' || e.reason === 'income'),
    );
    expect(earned.length).toBeGreaterThan(0);
  });

  it('values a promotion that this week’s job check will give as already earned (FR-43)', () => {
    const ready = edit(start(), (p) => {
      p.job = { ...newJobState(fixtureContent, 'clerk'), rating: 80 };
      p.credentials = ['cert'];
      p.stats.wardrobe = 1;
      p.experience = { office: 600 };
    });
    const worked = edit(ready, (p) => {
      if (p.job) p.job.minutesThisWeek = 60;
    });
    const value = (s: typeof ready) => valuation(fixtureContent, s, player(s), rival);
    expect(value(worked)).toBeGreaterThan(value(ready));
  });

  it('weighs event choices by their effects, with risk appetite setting where in a range it expects to land', () => {
    const state = start();
    const plan = (patch: Partial<ChoicePlan>): ChoicePlan => ({
      ...emptyPlan(),
      nextWeekMinutes: 0,
      jobRating: 0,
      layoffWarning: false,
      gigBanWeeks: 0,
      ...patch,
    });
    const decision: Decision = {
      id: 'd',
      player: 'p1',
      stepId: 'weekend-event',
      subject: 'x',
      options: ['safe', 'gamble'],
      plans: {
        safe: plan({ effects: [{ stat: 'happiness', delta: 4 }] }),
        gamble: plan({ outcomes: [{ stat: 'happiness', min: 0, max: 10 }] }),
      },
    };
    const best = (riskAppetiteBp: number) => {
      const scores = scoreChoices(fixtureContent, state, decision, { ...rival, riskAppetiteBp });
      return scores.reduce((a, b) => (b.score > a.score ? b : a)).option;
    };
    expect(best(1000)).toBe('safe');
    expect(best(9000)).toBe('gamble');
  });

  it('only ever takes legal actions, whatever its persona (FR-80)', () => {
    for (const persona of ['jones', 'jones-sloppy'])
      for (const seed of ['l1', 'l2']) {
        const state = start({
          seed,
          players: [human('Ada'), { ...jones, persona }],
          config: { weekLimit: 4 },
        });
        // The engine throws if the AI picks something its preview refuses.
        expect(() => play(state, endWeek, endWeek, endWeek, endWeek)).not.toThrow();
      }
  });

  it('replays Jones exactly from the human log (engine-design §7)', () => {
    const setup = { seed: 'r', players: [human('Ada'), jones], config: { weekLimit: 3 } };
    const { state } = play(start(setup), endWeek, endWeek, endWeek);
    expect(engine.hash(engine.replay(setup, [endWeek, endWeek, endWeek]))).toBe(engine.hash(state));
  });
});

describe('the rubber band on Jones (FR-83)', () => {
  const bandContent = {
    ...fixtureContent,
    ai: {
      ...fixtureContent.ai,
      rubberBand: {
        thresholdBp: 1000,
        spanBp: 1000,
        bestMoveDropBp: 4000,
        runnersUpExtra: 2,
        riskShiftBp: 2000,
        catchUpBp: 3000,
      },
    },
  };
  const persona = { ...rival, bestMoveRateBp: 6000, riskAppetiteBp: 5000, runnersUp: 2 };
  const base = start({ seed: 'band', players: [human('Ada'), jones] });
  /** Jones with `cash` extra: the standard wealth target is 100 000, so 10 000 cash is 2.5 points of score. */
  const richJones = (cash: number) =>
    edit(
      base,
      (p) => {
        p.stats.cash += cash;
      },
      1,
    );
  const richAda = (cash: number) =>
    edit(
      base,
      (p) => {
        p.stats.cash += cash;
      },
      0,
    );

  it('reads the lead from the public scores and ignores a close race', () => {
    expect(scoreLead(bandContent, base, 'p2')).toBe(0);
    expect(scoreLead(bandContent, richJones(20_000), 'p2')).toBe(500);
    expect(bandedPersona(bandContent, richJones(20_000), 'p2', persona)).toEqual(persona);
    expect(bandedPersona(bandContent, richAda(20_000), 'p2', persona)).toEqual(persona);
  });

  it('plays looser and riskier the further ahead it is, up to a ceiling', () => {
    const at = (cash: number) => bandedPersona(bandContent, richJones(cash), 'p2', persona);
    const some = at(60_000); // lead 1500: half way in
    const more = at(80_000); // lead 2000
    const most = at(400_000); // a full 25 points: past the span
    expect(some.bestMoveRateBp).toBeLessThan(persona.bestMoveRateBp);
    expect(more.bestMoveRateBp).toBeLessThan(some.bestMoveRateBp);
    expect(more.riskAppetiteBp).toBeGreaterThan(some.riskAppetiteBp);
    expect(most.bestMoveRateBp).toBe(persona.bestMoveRateBp - 4000);
    expect(most.riskAppetiteBp).toBe(persona.riskAppetiteBp + 2000);
    expect(most.runnersUp).toBe(persona.runnersUp + 2);
    // Only how it chooses moves: goals, horizon and weights are untouched.
    expect(most.goalWeightsBp).toEqual(persona.goalWeightsBp);
    expect(most.horizonWeeks).toBe(persona.horizonWeeks);
  });

  it('plays tighter and safer when far behind', () => {
    const behind = bandedPersona(bandContent, richAda(400_000), 'p2', persona);
    expect(behind.bestMoveRateBp).toBe(persona.bestMoveRateBp + 3000);
    expect(behind.riskAppetiteBp).toBe(persona.riskAppetiteBp - 2000);
    expect(behind.runnersUp).toBe(persona.runnersUp);
  });

  it('is off in the test fixture, so rule tests see an unbanded Jones', () => {
    expect(bandedPersona(fixtureContent, richJones(400_000), 'p2', persona)).toEqual(persona);
  });
});
