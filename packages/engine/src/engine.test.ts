import { describe, expect, it } from 'vitest';
import { fixtureContent } from './__fixtures__/content.ts';
import { createEngine, IllegalActionError } from './engine.ts';
import type { Pipeline } from './pipeline.ts';
import type { GameAction, GameState } from './types.ts';

const engine = createEngine(fixtureContent);
const solo = { seed: 'test', players: [{ name: 'Ada', kind: 'human' as const }] };
const duo = {
  seed: 'test',
  players: [
    { name: 'Ada', kind: 'human' as const },
    { name: 'Jones', kind: 'ai' as const },
  ],
};

function play(state: GameState, ...actions: GameAction[]) {
  const events = [];
  for (const action of actions) {
    const result = engine.reduce(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function player(s: GameState, i: number) {
  const p = s.players[i];
  if (!p) throw new Error(`no player ${i}`);
  return p;
}
const p1 = (s: GameState) => player(s, 0);
const walk = (to: string): GameAction => ({ type: 'travel', to, mode: 'walk' });
const perform = (action: string): GameAction => ({ type: 'perform', action });
const endWeek: GameAction = { type: 'endWeek' };

describe('newGame', () => {
  it('starts everyone at home with a full week and starting stats', () => {
    const state = engine.newGame(duo);
    expect(state.week).toBe(1);
    expect(state.turn).toBe(0);
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    for (const p of state.players) {
      expect(p.location).toBe('a');
      expect(p.hoursLeft).toBe(10);
      expect(p.stats).toEqual(fixtureContent.balance.startingStats);
    }
  });

  it('rejects games with no players or too many', () => {
    expect(() => engine.newGame({ seed: 's', players: [] })).toThrow();
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, kind: 'human' as const }));
    expect(() => engine.newGame({ seed: 's', players: many })).toThrow();
  });
});

describe('travel (FR-02)', () => {
  it('costs time and energy by distance, going the shorter way round', () => {
    const { state, events } = play(engine.newGame(solo), walk('e'));
    // a → e is 1 step backwards round the 5-location loop, not 4 forwards.
    expect(p1(state).location).toBe('e');
    expect(p1(state).hoursLeft).toBe(9);
    expect(p1(state).stats.energy).toBe(48);
    expect(events[0]).toMatchObject({ type: 'travelled', from: 'a', to: 'e', hours: 1 });
  });

  it('charges money for paid modes', () => {
    const preview = engine.previewAction(engine.newGame(solo), {
      type: 'travel',
      to: 'c',
      mode: 'cab',
    });
    expect(preview).toMatchObject({
      hours: 0.75,
      cost: 7,
      effects: { cash: { min: -7, max: -7 } },
    });
    const { state } = play(engine.newGame(solo), { type: 'travel', to: 'c', mode: 'cab' });
    expect(p1(state).stats.cash).toBe(13);
    expect(p1(state).hoursLeft).toBe(9.25);
  });

  it('blocks modes that need an item the player lacks', () => {
    const preview = engine.previewAction(engine.newGame(solo), {
      type: 'travel',
      to: 'b',
      mode: 'bike',
    });
    expect(preview.blockers).toContain('needsItem');
  });

  it('blocks trips to the current location, unknown places and unknown modes', () => {
    const state = engine.newGame(solo);
    expect(engine.previewAction(state, walk('a')).blockers).toContain('alreadyThere');
    expect(engine.previewAction(state, walk('zz')).blockers).toContain('unknownLocation');
    expect(
      engine.previewAction(state, { type: 'travel', to: 'b', mode: 'jet' }).blockers,
    ).toContain('unknownMode');
  });
});

describe('actions (FR-03)', () => {
  it('only allows actions at the current location', () => {
    const state = engine.newGame(solo);
    expect(engine.previewAction(state, perform('snack')).blockers).toEqual(['wrongLocation']);
    expect(engine.previewAction(state, perform('nope')).blockers).toEqual(['unknownAction']);
  });

  it('blocks actions the player cannot afford or fit in the week', () => {
    let { state } = play(engine.newGame(solo), walk('b'));
    state = { ...state, players: [{ ...p1(state), stats: { ...p1(state).stats, cash: 3 } }] };
    expect(engine.previewAction(state, perform('snack')).blockers).toEqual(['notEnoughCash']);
    expect(engine.previewAction(engine.newGame(solo), perform('grind')).blockers).toEqual([]);
    const tired = play(engine.newGame(solo), perform('rest')).state;
    expect(engine.previewAction(tired, perform('grind')).blockers).toEqual(['notEnoughTime']);
  });

  it('throws on illegal actions without changing state', () => {
    const state = engine.newGame(solo);
    expect(() => engine.reduce(state, perform('snack'))).toThrow(IllegalActionError);
    expect(state).toEqual(engine.newGame(solo));
  });

  it('applies effects net of cost and marks eating', () => {
    const { state, events } = play(engine.newGame(solo), walk('b'), perform('snack'));
    expect(p1(state).stats.cash).toBe(16);
    expect(p1(state).stats.health).toBe(49);
    expect(p1(state).fed).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'performed',
      action: 'snack',
      changes: { cash: -4, health: -1 },
    });
  });

  it('clamps stats to their ranges and reports the real change', () => {
    let state = engine.newGame(solo);
    state = { ...state, players: [{ ...p1(state), stats: { ...p1(state).stats, energy: 95 } }] };
    const { state: next, events } = play(state, perform('rest'));
    expect(p1(next).stats.energy).toBe(100);
    expect(events[0]).toMatchObject({ changes: { energy: 5 } });
  });

  it('rolls ranged effects inside the previewed range', () => {
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const start = play(engine.newGame({ ...solo, seed }), walk('b')).state;
      const preview = engine.previewAction(start, perform('party'));
      expect(preview.effects.social).toEqual({ min: 2, max: 9 });
      const { events } = play(start, perform('party'));
      const gain = (events[0] as { changes: { social: number } }).changes.social;
      expect(gain).toBeGreaterThanOrEqual(2);
      expect(gain).toBeLessThanOrEqual(9);
    }
  });

  it('shows and applies the low-energy modifier on output actions (FR-21)', () => {
    let state = play(engine.newGame(solo), walk('b'), walk('c')).state;
    state = { ...state, players: [{ ...p1(state), stats: { ...p1(state).stats, energy: 19 } }] };
    const preview = engine.previewAction(state, perform('shift'));
    expect(preview.modifiers).toEqual([{ id: 'lowEnergy', multiplier: 0.5 }]);
    // The gain is halved; the energy loss is not.
    expect(preview.effects).toMatchObject({
      cash: { min: 20, max: 20 },
      energy: { min: -15, max: -15 },
    });
    const { events } = play(state, perform('shift'));
    expect(events[0]).toMatchObject({ changes: { cash: 20, energy: -15 } });
  });
});

describe('ending the week (FR-04, FR-05)', () => {
  it('gives a rest bonus for unspent hours, then runs the food check and drift', () => {
    const { state, events } = play(engine.newGame(solo), walk('b'), endWeek);
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'travelled',
      'restBonus',
      'turnEnded',
      'hungry',
      'weeklyDrift',
      'roundEnded',
      'weekStarted',
      'turnStarted',
    ]);
    expect(events[1]).toMatchObject({ hours: 9, changes: { energy: 18 } });
    // 50 − 2 walk + 18 rest − 10 hunger + 20 drift
    expect(p1(state).stats.energy).toBe(76);
    expect(p1(state).stats.health).toBe(45);
    expect(p1(state).stats.social).toBe(47);
  });

  it('skips the hunger penalty when the player ate', () => {
    const { events } = play(engine.newGame(solo), walk('b'), perform('snack'), endWeek);
    expect(events.map((e) => e.type)).not.toContain('hungry');
  });

  it('resets time, location and hunger for the new week', () => {
    const { state } = play(engine.newGame(solo), walk('b'), perform('snack'), endWeek);
    expect(state.week).toBe(2);
    expect(p1(state)).toMatchObject({ location: 'a', hoursLeft: 10, fed: false });
  });

  it('ends the turn automatically when time runs out', () => {
    const { state, events } = play(engine.newGame(solo), perform('grind'));
    expect(events).toContainEqual({ type: 'turnEnded', player: 'p1', reason: 'outOfTime' });
    expect(events.map((e) => e.type)).not.toContain('restBonus');
    expect(state.week).toBe(2);
  });

  it('forces rest on burnout when energy hits zero', () => {
    const { events } = play(engine.newGame(solo), walk('b'), perform('party'));
    expect(events.map((e) => e.type)).toContain('burnout');
    expect(events).toContainEqual({ type: 'turnEnded', player: 'p1', reason: 'burnout' });
  });

  it('runs pipeline steps in order: per player after each turn, per round after everyone', () => {
    const calls: string[] = [];
    const pipeline: Pipeline = {
      perPlayer: ['food', 'bills', 'drift'].map((id) => ({
        id,
        run: ({ player }) => {
          calls.push(`${id}:${player.id}`);
        },
      })),
      perRound: ['market', 'news'].map((id) => ({
        id,
        run: () => {
          calls.push(id);
        },
      })),
    };
    const custom = createEngine(fixtureContent, { pipeline });
    let state = custom.newGame(duo);
    state = custom.reduce(state, endWeek).state;
    expect(calls).toEqual(['food:p1', 'bills:p1', 'drift:p1']);
    custom.reduce(state, endWeek);
    expect(calls).toEqual([
      'food:p1',
      'bills:p1',
      'drift:p1',
      'food:p2',
      'bills:p2',
      'drift:p2',
      'market',
      'news',
    ]);
  });
});

describe('rounds (FR-05a, FR-06)', () => {
  it('plays everyone through the same week in turn order', () => {
    let state = engine.newGame(duo);
    const r1 = engine.reduce(state, endWeek);
    state = r1.state;
    expect(state).toMatchObject({ week: 1, turn: 1 });
    expect(r1.events.at(-1)).toEqual({ type: 'turnStarted', player: 'p2', week: 1 });
    expect(r1.events.map((e) => e.type)).not.toContain('roundEnded');

    const r2 = engine.reduce(state, endWeek);
    expect(r2.state).toMatchObject({ week: 2, turn: 0 });
    expect(r2.events.at(-1)).toEqual({ type: 'turnStarted', player: 'p1', week: 2 });
  });

  it('applies actions to the current player only', () => {
    const { state } = play(engine.newGame(duo), endWeek, walk('b'));
    expect(player(state, 0).location).toBe('a');
    expect(player(state, 1).location).toBe('b');
  });
});

describe('legalActions', () => {
  it('lists reachable trips, local actions and End Week', () => {
    const actions = engine.legalActions(engine.newGame(solo));
    expect(actions).toContainEqual(walk('c'));
    expect(actions).toContainEqual({ type: 'travel', to: 'c', mode: 'cab' });
    expect(actions).not.toContainEqual({ type: 'travel', to: 'c', mode: 'bike' });
    expect(actions).not.toContainEqual(walk('a'));
    expect(actions).toContainEqual(perform('rest'));
    expect(actions).not.toContainEqual(perform('snack'));
    expect(actions.at(-1)).toEqual(endWeek);
  });

  it('previews the End Week rest bonus', () => {
    const preview = engine.previewAction(engine.newGame(solo), endWeek);
    expect(preview).toMatchObject({
      hours: 0,
      blockers: [],
      effects: { energy: { min: 20, max: 20 } },
    });
  });
});
