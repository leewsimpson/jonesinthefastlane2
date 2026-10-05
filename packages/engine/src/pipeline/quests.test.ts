import { describe, expect, it } from 'vitest';
import { hooksContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';
import { questProgressBp } from './quests.ts';

const content = { ...hooksContent, events: [], news: [] };
const { engine, start, play } = harness(content);

describe('micro-goals (ENG-11)', () => {
  it('issues quests at the start, only those whose condition holds', () => {
    const { state, events } = engine.newGame({
      seed: 'q',
      players: [{ name: 'Ada', controller: 'human' }],
    });
    expect(player(state).quests).toHaveLength(1);
    expect(eventsOf(events, 'questIssued')).toHaveLength(1);
    // Someone with a job is never asked to get hired.
    const hired = edit(state, (p) => {
      p.job = {
        id: 'clerk',
        wageBp: 10_000,
        hoursCapBp: 10_000,
        rating: 50,
        minutesThisWeek: 0,
        layoffWarning: false,
      };
      p.quests = [];
    });
    const next = play(hired, endWeek).state;
    expect(player(next).quests.map((q) => q.id)).toEqual(['save-up']);
  });

  it('pays the reward when done and issues the next one', () => {
    const fresh = edit(start(), (p) => {
      p.quests = [{ id: 'get-hired', deadline: 2, baseline: 0 }];
      p.location = 'd';
    });
    const { state, events } = play(fresh, perform('apply', { target: 'clerk' }), endWeek);
    expect(eventsOf(events, 'questCompleted')).toEqual([
      { type: 'questCompleted', player: 'p1', quest: 'get-hired' },
    ]);
    expect(eventsOf(events, 'moneyMoved')).toContainEqual(
      expect.objectContaining({
        to: 'cash',
        amount: 50,
        reason: 'reward',
        cause: { kind: 'quest', id: 'get-hired' },
      }),
    );
    expect(player(state).questsDone).toBe(1);
    expect(player(state).quests.map((q) => q.id)).toEqual(['save-up']);
  });

  it('fails a quest at its deadline, and waits out the cooldown before issuing it again', () => {
    const due = edit(start(), (p) => {
      p.quests = [{ id: 'save-up', deadline: 1, baseline: p.stats.cash }];
    });
    const week1 = play(due, endWeek);
    expect(eventsOf(week1.events, 'questFailed')).toEqual([
      { type: 'questFailed', player: 'p1', quest: 'save-up' },
    ]);
    expect(player(week1.state).seenQuests).toEqual({ 'save-up': 1 });
    expect(player(week1.state).quests.map((q) => q.id)).toEqual(['get-hired']);
  });

  it('measures progress from the moment it was issued', () => {
    const p = player(start());
    const save = { kind: 'save', amount: 500 } as const;
    expect(questProgressBp(content, p, save, p.stats.cash - 250)).toBe(5000);
    expect(questProgressBp(content, p, save, p.stats.cash)).toBe(0);
    expect(questProgressBp(content, p, { kind: 'hired' }, 0)).toBe(0);
  });
});
