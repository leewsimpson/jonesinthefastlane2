import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, player } from '../__fixtures__/play.ts';
import { newJobState } from '../jobs/jobs.ts';
import { teasersFor } from './teasers.ts';

const { start, play } = harness();
const jones = { name: 'Jones', controller: 'ai' as const };
const ids = (state: Parameters<typeof teasersFor>[1], i = 0) =>
  teasersFor(fixtureContent, state, player(state, i)).map((t) => t.teaser);

describe('next-week teasers (ENG-10)', () => {
  it('ends every human week with a hook, falling back to what Jones is up to', () => {
    const { events } = play(start({ seed: 't', players: [human('Ada'), jones] }), endWeek);
    const teasers = eventsOf(events, 'teaser');
    expect(teasers.length).toBeGreaterThan(0);
    expect(teasers.every((t) => t.player === 'p1')).toBe(true);
  });

  it('reads hooks off what will happen next week, most urgent first', () => {
    const state = edit(start(), (p) => {
      p.housing = { tier: 'flat', rent: 300, leaseWeeksLeft: 1, deposit: 600, missedRent: 1 };
      p.job = { ...newJobState(fixtureContent, 'clerk'), layoffWarning: true };
      p.enrollment = { course: 'cert', minutes: 60 };
      p.gigBanWeeks = 1;
    });
    // Eviction after 2 missed rents in the fixture, so one more is the last warning.
    expect(ids(state)).toEqual([
      'layoff',
      'eviction-risk',
      'lease-renewal',
      'credential-close',
      'gig-back',
    ]);
    expect(teasersFor(fixtureContent, state, player(state))[3]).toEqual({
      teaser: 'credential-close',
      params: { course: 'cert', hours: 1 },
    });
  });

  it('warns when a promotion is within a week of work', () => {
    const state = edit(start(), (p) => {
      p.job = { ...newJobState(fixtureContent, 'clerk'), rating: 60 };
      p.credentials = ['cert'];
      p.stats.wardrobe = 1;
      p.experience = { office: 60 };
    });
    expect(ids(state)).toContain('promotion-close');
  });

  it('says when Jones is close or ahead', () => {
    const { state, events } = play(start({ seed: 't', players: [human('Ada'), jones] }), endWeek);
    const record = (id: string) => state.history.find((r) => r.player === id);
    const close = (record('p2')?.scoreBp ?? 0) >= (record('p1')?.scoreBp ?? 0) - 500;
    const teasers = eventsOf(events, 'teaser').map((t) => t.teaser);
    expect(teasers.includes('rival-close')).toBe(close);
  });
});
