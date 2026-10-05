import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, player } from '../__fixtures__/play.ts';
import { emptyPlan } from '../actions/plan.ts';
import { newJobState } from '../jobs/jobs.ts';
import type { ChoicePlan, Decision } from '../types/state.ts';
import { scoreChoices, valuation } from './utility.ts';

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
