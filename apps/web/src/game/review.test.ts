import type { WeekRecord } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { createGameStore } from '../store/game.ts';
import { content } from './engine.ts';
import { bestAndWorst, review, timeline } from './review.ts';

const home = content.city.housing[0]?.id ?? '';
const nicer = content.city.housing[1]?.id ?? '';

const rec = (week: number, patch: Partial<WeekRecord> = {}): WeekRecord => ({
  week,
  player: 'p1',
  cash: 0,
  netWorth: 0,
  progressBp: { wealth: 0, wellbeing: 0, career: 0, skills: 0 },
  scoreBp: 0,
  job: null,
  jobLevel: 0,
  housing: home,
  credentials: 0,
  items: 0,
  questsDone: 0,
  ...patch,
});

describe('run review (ENG-21)', () => {
  it('turns week records into a life timeline', () => {
    const records = [
      rec(1, { job: 'picker', jobLevel: 1, items: 1 }),
      rec(2, { job: 'shift-lead', jobLevel: 2, items: 1 }),
      rec(3, { job: 'shift-lead', jobLevel: 2, housing: nicer, credentials: 1, items: 1 }),
      rec(4, { job: null, housing: nicer, credentials: 1, items: 1, questsDone: 2 }),
    ];
    expect(timeline(content, records)).toEqual([
      { week: 1, kind: 'hired', job: 'picker' },
      { week: 1, kind: 'items', count: 1 },
      { week: 2, kind: 'promoted', job: 'shift-lead' },
      { week: 3, kind: 'moved', home: nicer },
      { week: 3, kind: 'credential', count: 1 },
      { week: 4, kind: 'lostJob', job: 'shift-lead' },
      { week: 4, kind: 'quest', count: 2 },
    ]);
  });

  it('finds the best and worst week by net-worth change', () => {
    const r = [
      rec(1, { netWorth: 100 }),
      rec(2, { netWorth: 600 }),
      rec(3, { netWorth: 50 }),
      rec(4, { netWorth: 80 }),
    ];
    expect(bestAndWorst(r)).toEqual({
      best: { week: 2, delta: 500 },
      worst: { week: 3, delta: -550 },
    });
    expect(bestAndWorst([rec(1)])).toEqual({ best: null, worst: null });
    expect(bestAndWorst([rec(1), rec(2, { netWorth: 10 })])).toEqual({
      best: { week: 2, delta: 10 },
      worst: null,
    });
  });

  it('reviews a real game', () => {
    const store = createGameStore();
    store.getState().start('s', {
      seed: 'review',
      players: [
        { name: 'Ana', controller: 'human' },
        { name: 'Jones', controller: 'ai' },
      ],
      config: { weekLimit: 4 },
    });
    for (let i = 0; i < 40 && store.getState().session?.state.phase.kind !== 'gameOver'; i++) {
      const s = store.getState();
      const pending = s.session?.state.pending;
      if (pending)
        s.dispatch({ type: 'decide', decisionId: pending.id, optionId: pending.options[0] ?? '' });
      else if (s.report) s.nextStep();
      else s.dispatch({ type: 'endWeek' });
    }
    const state = store.getState().session?.state;
    if (!state) throw new Error('no state');
    const jones = review(content, state, 'p2');
    expect(jones.weeks).toBe(4);
    expect(jones.final?.week).toBe(4);
    expect(jones.peak).not.toBeNull();
  });
});
