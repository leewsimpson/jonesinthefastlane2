import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';
import { newJobState } from '../jobs/jobs.ts';
import type { GameState } from '../types/state.ts';

const { engine, start, play, reason } = harness();
const work = (minutes: number) => perform('work-c', { minutes });

/** At the clerk's workplace, already hired. */
const atWork = (state: GameState = start()) =>
  edit(state, (p) => {
    p.location = 'c';
    p.job = newJobState(fixtureContent, 'clerk');
  });

describe('jobs (FR-40, FR-43)', () => {
  it('needs a job at this employer to work a shift', () => {
    const noJob = edit(start(), (p) => {
      p.location = 'c';
    });
    expect(reason(noJob, work(60))).toBe('NO_JOB');
  });

  it('hires at JobLink when the job is open and the player qualifies', () => {
    const atD = edit(start(), (p) => {
      p.location = 'd';
    });
    expect(atD.world.openings).toEqual(['clerk']);
    const { state, events } = play(atD, perform('apply', { target: 'clerk' }));
    expect(player(state).job).toMatchObject({ id: 'clerk', rating: 50, minutesThisWeek: 0 });
    expect(eventsOf(events, 'jobChanged')).toEqual([
      { type: 'jobChanged', player: 'p1', change: 'hired', job: 'clerk' },
    ]);
    expect(reason(state, perform('apply', { target: 'clerk' }))).toBe('ALREADY_HIRED');
    expect(reason(state, perform('apply', { target: 'nope' }))).toBe('BAD_TARGET');
  });

  it('explains why the player does not qualify, in order', () => {
    const atD = edit(start(), (p) => {
      p.location = 'd';
    });
    expect(reason(atD, perform('apply', { target: 'manager' }))).toBe('NOT_OPEN');
    const open = { ...atD, world: { ...atD.world, openings: ['clerk', 'manager'] } };
    const apply = perform('apply', { target: 'manager' });
    expect(reason(open, apply)).toBe('DRESS_CODE');
    const dressed = edit(open, (p) => {
      p.stats.wardrobe = 1;
    });
    expect(reason(dressed, apply)).toBe('NEEDS_CREDENTIAL');
    const certified = edit(dressed, (p) => {
      p.credentials = ['cert'];
    });
    expect(reason(certified, apply)).toBe('NEEDS_EXPERIENCE');
    const experienced = edit(certified, (p) => {
      p.experience = { office: 120 };
    });
    expect(reason(experienced, apply)).toBeNull();
  });

  it('pays at the end of the shift, with experience and rating', () => {
    const plan = engine.preview(atWork(), work(120));
    expect(plan).toMatchObject({
      available: true,
      plan: {
        time: 120,
        effects: [
          { stat: 'cash', delta: 1200 },
          { stat: 'energy', delta: -4 },
        ],
      },
    });
    const { state, events } = play(atWork(), work(120));
    expect(player(state).stats.cash).toBe(3200);
    expect(player(state).experience).toEqual({ office: 120 });
    expect(player(state).job).toMatchObject({ rating: 60, minutesThisWeek: 120 });
    expect(eventsOf(events, 'moneyMoved')).toMatchObject([
      { from: 'outside', to: 'cash', amount: 1200, reason: 'wage' },
    ]);
  });

  it('offers each duration and refuses others', () => {
    const options = engine.listActions(atWork()).filter((o) => o.action.type === 'perform');
    expect(
      options.filter((o) => 'actionId' in o.action && o.action.actionId === 'work-c'),
    ).toHaveLength(3);
    expect(reason(atWork(), work(90))).toBe('BAD_DURATION');
    expect(reason(atWork(), perform('work-c'))).toBe('BAD_DURATION');
  });

  it("keeps counting this week's hours after a job change", () => {
    const worked = edit(start(), (p) => {
      p.job = { ...newJobState(fixtureContent, 'manager'), minutesThisWeek: 300 };
      p.location = 'd';
    });
    const hired = play(worked, perform('apply', { target: 'clerk' }));
    expect(player(hired.state).job?.minutesThisWeek).toBe(300);
  });

  it('caps the hours a job allows each week', () => {
    const { state } = play(atWork(), work(240), work(120));
    expect(reason(state, work(60))).toBe('HOURS_CAP');
  });

  it('scales pay by output modifiers such as gadgets (FR-21)', () => {
    const geared = edit(atWork(), (p) => {
      p.items = ['gadget'];
    });
    expect(engine.preview(geared, work(60))).toMatchObject({
      plan: {
        modifiers: [{ source: 'item.gadget', target: 'workOutput', bp: 1000 }],
        effects: [
          { stat: 'cash', delta: 660 },
          { stat: 'energy', delta: -2 },
        ],
      },
    });
  });
});

describe('GigHub (FR-44)', () => {
  it('works anywhere for a rolled rate inside the previewed range, with no ladder experience', () => {
    const preview = engine.preview(start(), perform('gig', { minutes: 120 }));
    expect(preview).toMatchObject({
      available: true,
      plan: { outcomes: [{ stat: 'cash', min: 200, max: 600 }] },
    });
    const { state } = play(start(), perform('gig', { minutes: 120 }));
    const earned = player(state).stats.cash - 2000;
    expect(earned).toBeGreaterThanOrEqual(200);
    expect(earned).toBeLessThanOrEqual(600);
    expect(player(state).experience).toEqual({});
  });

  it('can deactivate the player for some weeks', () => {
    const risky = harness({
      ...fixtureContent,
      balance: {
        ...fixtureContent.balance,
        gig: { deactivationChanceBp: 10_000, deactivationWeeks: 2 },
      },
    });
    const { state, events } = risky.play(risky.start(), perform('gig', { minutes: 60 }));
    expect(eventsOf(events, 'gigDeactivated')).toEqual([
      { type: 'gigDeactivated', player: 'p1', weeks: 2 },
    ]);
    expect(risky.reason(state, perform('gig', { minutes: 60 }))).toBe('GIG_DEACTIVATED');
    const week2 = risky.play(state, endWeek).state;
    expect(player(week2).gigBanWeeks).toBe(1);
  });
});

describe('job checks (FR-42, FR-43)', () => {
  it('promotes when experience, credentials, dress and rating allow', () => {
    const ready = edit(atWork(), (p) => {
      p.credentials = ['cert'];
      p.stats.wardrobe = 1;
    });
    // 120 minutes: 120 experience on the ladder and a rating of 50 + 2h × 5 = 60.
    const { state, events } = play(ready, work(120), endWeek);
    expect(player(state).job).toMatchObject({ id: 'manager', rating: 50 });
    expect(eventsOf(events, 'jobChanged')).toMatchObject([{ change: 'promoted', job: 'manager' }]);
  });

  it('lowers the rating after a week with no shifts, and lets the player go at 0', () => {
    const once = play(atWork(), endWeek).state;
    expect(player(once).job?.rating).toBe(20);
    const { state, events } = play(once, endWeek);
    expect(player(state).job).toBeNull();
    expect(eventsOf(events, 'jobChanged')).toMatchObject([{ change: 'letGo' }]);
  });

  it('rolls AI disruption: a layoff warning lands a week later (FR-42)', () => {
    const exposed = {
      ...fixtureContent,
      balance: {
        ...fixtureContent.balance,
        aiDisruption: {
          ...fixtureContent.balance.aiDisruption,
          baseRateBp: 10_000,
          outcomeWeights: { hoursCut: 0, restructure: 0, layoff: 1 },
        },
      },
      city: {
        ...fixtureContent.city,
        jobs: fixtureContent.city.jobs.map((j) => ({ ...j, aiExposureBp: 10_000 })),
      },
    };
    const h = harness(exposed);
    const hired = edit(h.start(), (p) => {
      p.location = 'c';
      p.job = newJobState(exposed, 'clerk');
    });
    const warned = h.play(hired, perform('work-c', { minutes: 60 }), endWeek);
    expect(player(warned.state).job?.layoffWarning).toBe(true);
    expect(eventsOf(warned.events, 'jobChanged')).toMatchObject([{ change: 'layoffWarning' }]);
    const laidOff = h.play(warned.state, endWeek);
    expect(player(laidOff.state).job).toBeNull();
    expect(eventsOf(laidOff.events, 'jobChanged')).toMatchObject([{ change: 'laidOff' }]);
  });

  it('AI-tools skill cuts exposure and raises output', () => {
    const skilled = edit(atWork(), (p) => {
      p.trackMinutes.tech = 240; // ⌊√4⌋ = 2 points
    });
    expect(engine.preview(skilled, work(60))).toMatchObject({
      plan: { modifiers: [{ source: 'track.tech', target: 'workOutput', bp: 1000 }] },
    });
  });
});
