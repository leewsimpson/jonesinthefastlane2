import { describe, expect, it } from 'vitest';
import { fixtureContent, hooksContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';
import { newsEffect } from '../hooks/news.ts';

const { engine, start, play } = harness({ ...hooksContent, events: [], quests: [] });

describe('news ticker (FR-72)', () => {
  it('breaks a story on the world stream, runs it for its weeks, then ends it', () => {
    const week1 = play(start(), endWeek);
    expect(eventsOf(week1.events, 'newsStarted')).toEqual([
      { type: 'newsStarted', news: 'surge', weeks: 2 },
    ]);
    expect(week1.state.world.news).toEqual([{ id: 'surge', since: 1, weeksLeft: 2 }]);
    const week2 = play(week1.state, endWeek);
    expect(week2.state.world.news).toEqual([{ id: 'surge', since: 1, weeksLeft: 1 }]);
    const week3 = play(week2.state, endWeek);
    expect(eventsOf(week3.events, 'newsEnded')).toEqual([{ type: 'newsEnded', news: 'surge' }]);
    // Room for a story again, so the next one breaks in the same round.
    expect(week3.state.world.news).toEqual([{ id: 'surge', since: 3, weeksLeft: 2 }]);
  });

  it('moves the economy while it runs: gig surge pricing (FR-44) and the disruption rate', () => {
    const before = engine.preview(start(), perform('gig', { minutes: 60 }));
    const during = play(start(), endWeek).state;
    const surged = engine.preview(during, perform('gig', { minutes: 60 }));
    expect(before.plan?.outcomes[0]).toMatchObject({ stat: 'cash', min: 100, max: 300 });
    // +50% gig pay.
    expect(surged.plan?.outcomes[0]).toMatchObject({ stat: 'cash', min: 150, max: 450 });
    expect(newsEffect(hooksContent, during.world, 'disruptionBp')).toBe(10_000);
    expect(newsEffect(hooksContent, during.world, 'gigPayBp')).toBe(5000);
  });

  it('raises rents at renewal while a housing story runs (FR-51)', () => {
    const leased = edit(start(), (p) => {
      p.housing = { tier: 'flat', rent: 300, leaseWeeksLeft: 2, deposit: 600, missedRent: 0 };
    });
    const quiet = harness().play(leased, endWeek, endWeek);
    const news = play(leased, endWeek, endWeek);
    const renewal = (events: typeof news.events) =>
      eventsOf(events, 'leaseRenewed').map((e) => e.to)[0] ?? 0;
    // The same rolled hike, plus the story's +10%.
    expect(renewal(news.events) - renewal(quiet.events)).toBe(30);
  });

  it('never breaks without content: the fixture deck has no stories', () => {
    const plain = harness(fixtureContent);
    expect(eventsOf(plain.play(plain.start(), endWeek).events, 'newsStarted')).toEqual([]);
    expect(player(plain.start()).quests).toEqual([]);
  });
});
