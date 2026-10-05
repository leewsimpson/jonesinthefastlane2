import type { GameContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { hooksContent } from '../__fixtures__/content.ts';
import { edit, endWeek, eventsOf, harness, human, perform, player } from '../__fixtures__/play.ts';
import { newJobState } from '../jobs/jobs.ts';

/** The hooks fixture with only these cards in the deck. */
const deckOf = (...ids: string[]): GameContent => ({
  ...hooksContent,
  events: hooksContent.events.filter((e) => ids.includes(e.id)),
});

describe('weekend events (FR-70, FR-71)', () => {
  it('applies a one-choice card straight away, rolling inside the range shown', () => {
    const { start, play } = harness(deckOf('windfall', 'crash'));
    const { state, events } = play(start(), endWeek);
    expect(eventsOf(events, 'weekendEvent')).toEqual([
      { type: 'weekendEvent', player: 'p1', event: 'windfall', category: 'money' },
    ]);
    expect(eventsOf(events, 'eventResolved')).toEqual([
      { type: 'eventResolved', player: 'p1', event: 'windfall', choice: 'take' },
    ]);
    const won = eventsOf(events, 'moneyMoved').find((e) => e.cause.kind === 'event');
    expect(won).toMatchObject({ from: 'outside', to: 'cash', reason: 'income' });
    expect(won?.amount).toBeGreaterThanOrEqual(100);
    expect(won?.amount).toBeLessThanOrEqual(200);
    expect(state.pending).toBeNull();
    expect(player(state).seenEvents).toEqual({ windfall: 1 });
  });

  it('pauses for a choice, previews each option, and offers only what the player can take', () => {
    const { engine, start, play } = harness(deckOf('dilemma', 'crash'));
    const { state } = play(start(), endWeek);
    const decision = state.pending;
    // No bike, so the bike ride isn't offered (FR-70: condition-filtered).
    expect(decision).toMatchObject({
      stepId: 'weekend-event',
      subject: 'dilemma',
      options: ['splurge', 'save'],
    });
    const options = engine.listActions(state);
    expect(options.map((o) => o.action)).toEqual([
      { type: 'decide', decisionId: decision?.id, optionId: 'splurge' },
      { type: 'decide', decisionId: decision?.id, optionId: 'save' },
    ]);
    expect(options[0]?.plan).toMatchObject({
      money: 300,
      effects: [{ stat: 'happiness', delta: 10 }],
      nextWeekMinutes: -60,
    });

    const broke = edit(start(), (p) => {
      p.stats.cash = 100;
    });
    // Only one choice left, so there's nothing to decide: it applies at once.
    const brokeWeek = play(broke, endWeek);
    expect(brokeWeek.state.pending).toBeNull();
    expect(eventsOf(brokeWeek.events, 'eventResolved')).toMatchObject([{ choice: 'save' }]);
    const biker = edit(start(), (p) => {
      p.items.push('bike');
    });
    expect(play(biker, endWeek).state.pending?.options).toEqual(['splurge', 'save', 'bike-ride']);
  });

  it('applies the choice, and its time cost lands on next week', () => {
    const { start, play } = harness(deckOf('dilemma', 'crash'));
    const paused = play(start(), endWeek).state;
    const decision = paused.pending;
    if (!decision) throw new Error('expected a decision');
    const { state, events } = play(paused, {
      type: 'decide',
      decisionId: decision.id,
      optionId: 'splurge',
    });
    expect(eventsOf(events, 'eventResolved')).toEqual([
      { type: 'eventResolved', player: 'p1', event: 'dilemma', choice: 'splurge' },
    ]);
    expect(state.week).toBe(2);
    expect(player(state).timeLeft).toBe(600 - 60);
    expect(player(state).nextWeekMinutes).toBe(0);
  });

  it('only draws work cards for players with a job, and they can bring a layoff warning (FR-42)', () => {
    const { start, play } = harness(deckOf('boss', 'crash'));
    expect(eventsOf(play(start(), endWeek).events, 'weekendEvent')).toEqual([]);
    const hired = edit(start(), (p) => {
      p.job = newJobState(hooksContent, 'clerk', 30);
      p.job.minutesThisWeek = 60;
    });
    const { state, events } = play(hired, endWeek);
    expect(eventsOf(events, 'jobChanged')).toContainEqual({
      type: 'jobChanged',
      player: 'p1',
      change: 'layoffWarning',
      job: 'clerk',
    });
    expect(player(state).job).toMatchObject({ rating: 20, layoffWarning: true });
  });

  it('draws a burnout card after a week that ended at 0 Energy (§4 Energy)', () => {
    const { start, play } = harness(deckOf('windfall', 'crash'));
    const tired = edit(start(), (p) => {
      p.stats.energy = 60;
      p.location = 'b';
    });
    // The party costs 60 Energy: the turn ends exhausted.
    const { state, events } = play(tired, perform('party'));
    expect(eventsOf(events, 'turnEnded')).toMatchObject([{ reason: 'exhausted' }]);
    expect(eventsOf(events, 'weekendEvent')).toMatchObject([{ event: 'crash' }]);
    expect(player(state).burnout).toBe(false);
    expect(player(state).timeLeft).toBe(600 - 120);
  });

  it("waits out a card's cooldown before drawing it again", () => {
    const { start, play } = harness(deckOf('windfall', 'crash'));
    const week2 = play(start(), endWeek);
    const week3 = play(week2.state, endWeek);
    const week4 = play(week3.state, endWeek);
    const drawn = [week2, week3, week4].map((w) => eventsOf(w.events, 'weekendEvent').length);
    // Cooldown 2: drawn in week 1, not week 2, again in week 3.
    expect(drawn).toEqual([1, 0, 1]);
  });

  it('lets the AI choose for Jones on the spot', () => {
    const { start, play } = harness(deckOf('dilemma', 'crash'));
    const jones = { name: 'Jones', controller: 'ai' as const };
    const paused = play(start({ seed: 's', players: [human('Ada'), jones] }), endWeek).state;
    const decision = paused.pending;
    if (!decision) throw new Error('expected a decision for Ada');
    const { state, events } = play(paused, {
      type: 'decide',
      decisionId: decision.id,
      optionId: 'save',
    });
    expect(eventsOf(events, 'eventResolved').map((e) => e.player)).toEqual(['p1', 'p2']);
    expect(state.week).toBe(2);
  });
});
