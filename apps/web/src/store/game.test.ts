import type { GameSetup, Preview } from '@fastlane/engine';
import { describe, expect, it, vi } from 'vitest';
import { content, engine } from '../game/engine.ts';
import { reportSteps } from '../game/report.ts';
import { createGameStore, type GameStore, type Session } from './game.ts';

/** A value the test needs, or a clear failure. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

const solo: GameSetup = {
  seed: 'store-test',
  players: [
    { name: 'Ana', controller: 'human' },
    { name: 'Jones', controller: 'ai' },
  ],
};

/** Click through the end-of-week sequence, taking the first option of any weekend choice. */
function finishReport(store: GameStore) {
  for (let i = 0; i < 20 && store.getState().report; i++) {
    const { session } = store.getState();
    const pending = session?.state.pending;
    if (pending) {
      const optionId = pending.options[0];
      if (!optionId) throw new Error('decision without options');
      expect(store.getState().dispatch({ type: 'decide', decisionId: pending.id, optionId })).toBe(
        true,
      );
    } else store.getState().nextStep();
  }
  expect(store.getState().report).toBeNull();
}

describe('game store', () => {
  it('plays a week: in-turn events feed the ticker, the week end opens the report, every change autosaves', () => {
    const save = vi.fn<(s: Session) => void>();
    const store = createGameStore(save);
    store.getState().start('slot-1', solo);
    expect(save).toHaveBeenCalledTimes(1);

    const nap = engine
      .listActions(must(store.getState().session, 'session').state)
      .find((p) => p.action.type === 'perform' && p.action.actionId === 'nap');
    expect(nap?.available).toBe(true);
    expect(store.getState().dispatch(must(nap).action)).toBe(true);
    expect(store.getState().lastEvents.some((e) => e.type === 'actionPerformed')).toBe(true);
    expect(store.getState().report).toBeNull();

    expect(store.getState().dispatch({ type: 'endWeek' })).toBe(true);
    const { report, session } = store.getState();
    expect(report?.player).toBe('p1');
    expect(report?.events[0]).toMatchObject({ type: 'turnEnded', player: 'p1' });
    expect(reportSteps(must(report, 'report'), must(session, 'session').state)[0]).toBe('event');

    finishReport(store);
    const after = must(store.getState().session, 'session');
    expect(after.state.week).toBe(2);
    expect(after.state.phase).toEqual({ kind: 'turn', player: 'p1' });
    expect(after.log[0]).toEqual(must(nap).action);
    expect(store.getState().handoff).toBeNull();
    // The last save is the current session, so a reload resumes exactly here.
    expect(save.mock.lastCall?.[0]).toBe(after);
  });

  it('ends the game at the week limit, after the last week report (FR-12)', () => {
    const store = createGameStore();
    store.getState().start('slot-1', { ...solo, config: { weekLimit: 2 } });
    for (let week = 1; week <= 2; week++) {
      store.getState().dispatch({ type: 'endWeek' });
      finishReport(store);
    }
    const { state } = must(store.getState().session, 'session');
    expect(state.phase.kind).toBe('gameOver');
    expect(store.getState().handoff).toBeNull();
  });

  it('refuses an illegal action without changing anything', () => {
    const store = createGameStore();
    store.getState().start('slot-1', solo);
    const before = store.getState().session;
    expect(store.getState().dispatch({ type: 'travel', to: 'your-place', mode: 'walk' })).toBe(
      false,
    );
    expect(store.getState().error).toEqual({ code: 'ALREADY_THERE' });
    expect(store.getState().session).toBe(before);
  });

  it('hands the device over between humans (FR-06)', () => {
    const store = createGameStore();
    store.getState().start('slot-1', {
      seed: 'hotseat',
      players: [
        { name: 'Ana', controller: 'human' },
        { name: 'Ben', controller: 'human' },
        { name: 'Jones', controller: 'ai' },
      ],
    });
    expect(store.getState().handoff).toBe('p1');
    store.getState().takeHandoff();
    store.getState().dispatch({ type: 'endWeek' });
    finishReport(store);
    expect(store.getState().handoff).toBe('p2');
    expect(must(store.getState().session, 'session').state.phase).toEqual({
      kind: 'turn',
      player: 'p2',
    });
  });

  it('reopens the sequence when a save was made with a weekend choice open', () => {
    const store = createGameStore();
    // Play weeks until a weekend event asks for a choice.
    store.getState().start('slot-1', solo);
    for (
      let week = 0;
      week < 30 && !must(store.getState().session, 'session').state.pending;
      week++
    ) {
      store.getState().dispatch({ type: 'endWeek' });
      if (!must(store.getState().session, 'session').state.pending) finishReport(store);
    }
    const session = must(store.getState().session, 'session');
    expect(session.state.pending).not.toBeNull();

    const fresh = createGameStore();
    fresh.getState().resume(session);
    expect(fresh.getState().report?.player).toBe(must(session.state.pending, 'decision').player);
    finishReport(fresh);
    expect(must(fresh.getState().session, 'session').state.pending).toBeNull();
  });

  it('times the first paycheck and the week in active play time, and turns it into fx (ENG-20, ENG-01)', () => {
    let clock = 0;
    const store = createGameStore(undefined, () => clock);
    store.getState().start('slot-1', solo);
    const act = (pick: (p: Preview) => boolean) => {
      clock += 10_000;
      const state = must(store.getState().session, 'session').state;
      const p = must(
        engine.listActions(state).find((x) => x.available && pick(x)),
        'action',
      );
      expect(store.getState().dispatch(p.action)).toBe(true);
    };
    act((p) => p.action.type === 'travel' && p.action.to === 'joblink');
    act((p) => p.action.type === 'perform' && p.action.actionId === 'apply-job');
    expect(store.getState().fx.moment).toMatchObject({ kind: 'hired' });
    const job = must(must(store.getState().session, 'session').state.players[0]?.job, 'job');
    const workAt = must(
      content.city.jobs.find((j) => j.id === job.id),
      'job content',
    ).location;
    if (workAt !== 'joblink') act((p) => p.action.type === 'travel' && p.action.to === workAt);
    act((p) => p.action.type === 'perform' && p.action.actionId.startsWith('work-'));
    const { fx, session } = store.getState();
    expect(fx.moment).toMatchObject({ kind: 'paid' });
    expect(fx.coins).toBeGreaterThan(0);
    const pace = must(session, 'session').pace;
    expect(pace.firstPayMs.p1).toBe(pace.playMs);
    expect(pace.playMs).toBe(workAt === 'joblink' ? 30_000 : 40_000);

    clock += 5_000;
    store.getState().dispatch({ type: 'endWeek' });
    expect(must(store.getState().session, 'session').pace.weeks).toEqual([
      { player: 'p1', week: 1, ms: pace.playMs + 5_000 },
    ]);
  });

  it('shows the weekend card in every week that drew an event (FR-05, FR-70)', () => {
    const store = createGameStore();
    store.getState().start('slot-ev', { ...solo, seed: 'weekend-cards' });
    let drawn = 0;
    for (let week = 0; week < 25; week++) {
      if (store.getState().session?.state.phase.kind !== 'turn') break;
      store.getState().dispatch({ type: 'endWeek' });
      const { report, session } = store.getState();
      const r = must(report, 'report');
      const shown = reportSteps(r, must(session, 'session').state).includes('event');
      finishReport(store);
      // Events collected over the whole sequence, including those after a choice.
      const happened = r.events.some((e) => e.type === 'weekendEvent' && e.player === 'p1');
      if (happened) drawn++;
      expect(shown, `week ${week + 1}`).toBe(happened);
      store.getState().takeHandoff();
    }
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeGreaterThan(0);
  });
});
