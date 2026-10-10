import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';
import { skillPoints } from '../stats/stats.ts';
import { finishMinutes } from './education.ts';

const { engine, start, play, reason } = harness();
const atCampus = () =>
  edit(start(), (p) => {
    p.location = 'e';
  });

describe('education (§5, §3 Skills)', () => {
  it('enrols for cash tuition, one course at a time', () => {
    expect(engine.preview(atCampus(), perform('enroll', { target: 'cert' }))).toMatchObject({
      available: true,
      plan: { money: 1000 },
    });
    const { state, events } = play(atCampus(), perform('enroll', { target: 'cert' }));
    expect(player(state).stats.cash).toBe(1000);
    expect(player(state).enrollment).toEqual({ course: 'cert', minutes: 0 });
    expect(eventsOf(events, 'enrolled')).toEqual([
      { type: 'enrolled', player: 'p1', course: 'cert', loan: false },
    ]);
    expect(reason(state, perform('enroll', { target: 'degree' }))).toBe('ALREADY_ENROLLED');
  });

  it('puts loan-eligible tuition on a student loan, and the preview shows the debt (FR-54, FR-03)', () => {
    expect(reason(atCampus(), perform('enroll-loan', { target: 'cert' }))).toBe('NO_LOAN');
    expect(engine.preview(atCampus(), perform('enroll-loan', { target: 'degree' }))).toMatchObject({
      plan: { money: 0, transfers: [{ from: 'debt:student', to: 'outside', amount: 5000 }] },
    });
    const { state, events } = play(atCampus(), perform('enroll-loan', { target: 'degree' }));
    expect(player(state).stats.cash).toBe(2000);
    expect(player(state).debts.student.balance).toBe(5000);
    expect(eventsOf(events, 'moneyMoved')).toMatchObject([
      { from: 'debt:student', to: 'outside', amount: 5000, reason: 'tuition' },
    ]);
  });

  it('earns the credential once enough study is done, and skill points on its track', () => {
    expect(reason(atCampus(), perform('study', { minutes: 60 }))).toBe('NOT_ENROLLED');
    const { state, events } = play(
      atCampus(),
      perform('enroll', { target: 'cert' }),
      perform('study', { minutes: 60 }),
      perform('study', { minutes: 60 }),
    );
    expect(player(state).credentials).toEqual(['cert']);
    expect(player(state).enrollment).toBeNull();
    expect(player(state).trackMinutes).toEqual({ tech: 120, craft: 0 });
    expect(eventsOf(events, 'credentialEarned')).toEqual([
      { type: 'credentialEarned', player: 'p1', course: 'cert' },
    ]);
    expect(reason(state, perform('enroll', { target: 'cert' }))).toBe('ALREADY_EARNED');
  });

  it('cuts a study block to what finishes the course, with time and energy to match', () => {
    const half = play(
      atCampus(),
      perform('enroll', { target: 'cert' }),
      perform('study', { minutes: 60 }),
    ).state;
    const before = player(half);
    const preview = engine.preview(half, perform('study', { minutes: 120 }));
    expect(preview).toMatchObject({ available: true, plan: { time: 60 } });
    const { state } = play(half, perform('study', { minutes: 120 }));
    expect(before.timeLeft - player(state).timeLeft).toBe(60);
    expect(before.stats.energy - player(state).stats.energy).toBe(1);
    expect(player(state).credentials).toEqual(['cert']);
    expect(player(state).trackMinutes.tech).toBe(120);
  });

  it('offers the exact finishing length in place of blocks that would overshoot', () => {
    const half = play(
      atCampus(),
      perform('enroll', { target: 'cert' }),
      perform('study', { minutes: 60 }),
    ).state;
    const minutes = engine
      .listActions(half)
      .filter((o) => o.action.type === 'perform' && o.action.actionId === 'study')
      .map((o) => (o.action.type === 'perform' ? o.action.minutes : undefined));
    expect(minutes).toEqual([60]);
  });

  it('sizes the finishing block for a study penalty (low energy stretches the time needed)', () => {
    const content = {
      ...fixtureContent,
      balance: {
        ...fixtureContent.balance,
        statModifiers: [
          { id: 'low-energy-study', stat: 'energy', below: 20, target: 'studyOutput', bp: -2000 },
        ],
      },
    } as typeof fixtureContent;
    const state = edit(play(atCampus(), perform('enroll', { target: 'cert' })).state, (p) => {
      p.stats.energy = 10;
    });
    const def = content.city.actions.find((a) => a.id === 'study');
    if (!def) throw new Error('fixture has a study action');
    // 120 course minutes at 80% output need 150 minutes of study.
    expect(
      finishMinutes({ content, state, player: player(state) }, def, { course: 'cert', minutes: 0 }),
    ).toBe(150);
  });

  it('gives skill points with diminishing returns per track', () => {
    const points = (minutes: number) =>
      skillPoints(
        fixtureContent,
        edit(start(), (p) => {
          p.trackMinutes.tech = minutes;
        }).players[0] ?? player(start()),
        'tech',
      );
    // ⌊√hours⌋ with scale 1: 1h → 1, 4h → 2, 9h → 3, 100h → 10.
    expect([60, 240, 540, 6000].map(points)).toEqual([1, 2, 3, 10]);
  });
});
