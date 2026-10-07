import { WeekendEventSchema } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, perform } from '../__fixtures__/play.ts';
import { newJobState } from '../jobs/jobs.ts';
import type { GameState } from '../types/state.ts';

const { start, play } = harness();
const jones = { name: 'Jones', controller: 'ai' as const };
const duo = () => start({ seed: 'feed', players: [human('Ada'), jones] });

describe("Jones's highlight reel and rival tension (FR-82, ENG-13, ENG-14)", () => {
  it("reports everyone's standing after each round", () => {
    const { events } = play(duo(), endWeek);
    const [standings] = eventsOf(events, 'standings');
    expect(standings?.week).toBe(1);
    expect(Object.keys(standings?.scoresBp ?? {})).toEqual(['p1', 'p2']);
    expect(Object.keys(standings?.progressBp.p1 ?? {})).toEqual([
      'wealth',
      'wellbeing',
      'skills',
      'career',
    ]);
  });

  it('posts once a week about its own week, and reacts to the human getting hired', () => {
    const atJobLink = edit(duo(), (p) => {
      p.location = 'd';
    });
    const { events } = play(atJobLink, perform('apply', { target: 'clerk' }), endWeek);
    const posts = eventsOf(events, 'rivalPost');
    expect(posts.filter((p) => p.about === null)).toHaveLength(1);
    expect(posts).toContainEqual({
      type: 'rivalPost',
      player: 'p2',
      moment: 'react-hired',
      about: 'p1',
      params: { player: 'p1', job: 'clerk' },
    });
  });

  it('reacts gently to a setback', () => {
    const employed = edit(duo(), (p) => {
      p.job = { ...newJobState(fixtureContent, 'clerk'), minutesThisWeek: 60 };
    });
    const week1 = play(employed, endWeek).state;
    // A layoff lands at week 2's job check: a job last week, none this week.
    const warned = edit(week1, (p) => {
      if (p.job) p.job.layoffWarning = true;
    });
    expect(eventsOf(play(warned, endWeek).events, 'rivalPost')).toContainEqual(
      expect.objectContaining({ moment: 'react-setback', about: 'p1' }),
    );
  });

  it('flags a goal entering the last stretch, and the gap at the end of the game (ENG-13)', () => {
    // Fixture Chill wealth target is 3000 cents; 2800 is 93%.
    const chill = start({
      seed: 'n',
      players: [human('Ada')],
      config: { difficulty: 'chill', weekLimit: 1 },
    });
    const near = edit(chill, (p) => {
      p.stats.cash = 2800;
    });
    const wealthMisses = (s: GameState) =>
      eventsOf(play(s, endWeek).events, 'nearMiss').filter((e) => e.goal === 'wealth');
    // The game ends after this round: the final gap ("you were $2 away").
    expect(wealthMisses(near)).toMatchObject([{ final: true, short: 200 }]);
    // No week limit: the weekly heads-up instead.
    const open = edit(
      start({ seed: 'n', players: [human('Ada')], config: { difficulty: 'chill' } }),
      (p) => {
        p.stats.cash = 2800;
      },
    );
    expect(wealthMisses(open)).toMatchObject([{ final: false, short: 200 }]);
  });

  it('marks overtakes on score (ENG-14)', () => {
    const behind = edit(
      duo(),
      (p) => {
        p.stats.cash = 0;
        p.stats.happiness = 0;
      },
      0,
    );
    const { events } = play(behind, endWeek);
    expect(eventsOf(events, 'overtaken')).toContainEqual({
      type: 'overtaken',
      player: 'p1',
      by: 'p2',
    });
    expect(eventsOf(events, 'rivalPost')).toContainEqual(
      expect.objectContaining({ moment: 'overtook', about: 'p1' }),
    );
  });
});

describe("Jones's viral moment (FR-82)", () => {
  it('posts about going viral when its weekend card was a viral one', () => {
    const viral = {
      ...fixtureContent,
      events: WeekendEventSchema.array().parse([
        {
          id: 'trend',
          category: 'viral' as const,
          weight: 1,
          choices: [{ id: 'ride-it', effects: { happiness: 2 } }],
        },
      ]),
    };
    const { start: begin, play: go } = harness(viral);
    const { events } = go(begin({ seed: 'viral', players: [human('Ada'), jones] }), endWeek);
    const own = eventsOf(events, 'rivalPost').filter((p) => p.about === null);
    expect(own).toEqual([
      { type: 'rivalPost', player: 'p2', moment: 'went-viral', about: null, params: {} },
    ]);
  });
});
