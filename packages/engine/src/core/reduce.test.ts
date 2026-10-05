import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import type { Pipeline } from '../pipeline/types.ts';
import type { Action } from '../types/actions.ts';
import type { DomainEvent } from '../types/events.ts';
import type { GameSetup, GameState, PlayerState } from '../types/state.ts';
import { createEngine } from './reduce.ts';

const engine = createEngine(fixtureContent);
const human = (name: string) => ({ name, controller: 'human' as const });
const solo: GameSetup = { seed: 'test', players: [human('Ada')] };
const duo: GameSetup = { seed: 'test', players: [human('Ada'), human('Bo')] };
const start = (setup: GameSetup = solo) => engine.newGame(setup).state;

function play(state: GameState, ...actions: Action[]) {
  const events: DomainEvent[] = [];
  for (const action of actions) {
    const result = engine.reduce(state, action);
    if (!result.ok) throw new Error(`${JSON.stringify(action)}: ${result.error.code}`);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function player(s: GameState, i: number): PlayerState {
  const p = s.players[i];
  if (!p) throw new Error(`no player ${i}`);
  return p;
}
const p1 = (s: GameState) => player(s, 0);
const withStats = (s: GameState, stats: Partial<PlayerState['stats']>): GameState => ({
  ...s,
  players: [{ ...p1(s), stats: { ...p1(s).stats, ...stats } }, ...s.players.slice(1)],
});
const walk = (to: string): Action => ({ type: 'travel', to, mode: 'walk' });
const perform = (actionId: string): Action => ({ type: 'perform', actionId });
const endWeek: Action = { type: 'endWeek' };
const reason = (state: GameState, action: Action) => {
  const preview = engine.preview(state, action);
  return preview.available ? null : preview.reason.code;
};

describe('newGame', () => {
  it('starts everyone at home with a full week and starting stats', () => {
    const { state, events } = engine.newGame(duo);
    expect(state).toMatchObject({ week: 1, phase: { kind: 'turn', player: 'p1' }, pending: null });
    expect(state.config).toEqual({
      weekLimit: null,
      turnLengthWeeks: 1,
      difficulty: 'standard',
      goals: fixtureContent.balance.goals.presets.standard,
    });
    expect(events).toEqual([{ type: 'turnStarted', player: 'p1', week: 1 }]);
    for (const p of state.players) {
      expect(p).toMatchObject({ location: 'a', timeLeft: 600, mealsThisWeek: 0 });
      expect(p.stats).toEqual(fixtureContent.balance.startingStats);
    }
  });

  it('rejects games with no players, too many humans, or AI only with no end', () => {
    expect(() => engine.newGame({ seed: 's', players: [] })).toThrow();
    const many = Array.from({ length: 5 }, (_, i) => human(`P${i}`));
    expect(() => engine.newGame({ seed: 's', players: many })).toThrow();
    const jones = { name: 'Jones', controller: 'ai' as const };
    expect(() => engine.newGame({ seed: 's', players: [jones] })).toThrow(/week limit/);
  });

  it('rejects setups no game can run with', () => {
    const one = [human('Ada')];
    expect(() =>
      engine.newGame({
        seed: 's',
        players: one,
        config: { goals: { wealth: 0, wellbeing: 1, skills: 1, career: 1 } },
      }),
    ).toThrow(/wealth/);
    expect(() =>
      engine.newGame({ seed: 's', players: one, config: { difficulty: 'easy' as 'chill' } }),
    ).toThrow(/unknown difficulty/);
    expect(() => engine.newGame({ seed: 's', players: one, config: { weekLimit: 0 } })).toThrow(
      /week limit/,
    );
    expect(() =>
      engine.newGame({ seed: 's', players: one, config: { turnLengthWeeks: 1.5 } }),
    ).toThrow(/turnLengthWeeks/);
  });

  it('plays an AI that goes first before handing over', () => {
    const jones = { name: 'Jones', controller: 'ai' as const };
    const { state, events } = engine.newGame({ seed: 's', players: [jones, human('Ada')] });
    expect(state.phase).toEqual({ kind: 'turn', player: 'p2' });
    expect(events).toContainEqual({ type: 'turnEnded', player: 'p1', reason: expect.any(String) });
  });
});

describe('travel (FR-02)', () => {
  it('costs time and energy by distance, going the shorter way round', () => {
    const { state, events } = play(start(), walk('e'));
    // a → e is 2 back over the long segment, not 4 forward.
    expect(p1(state)).toMatchObject({ location: 'e', timeLeft: 480 });
    expect(p1(state).stats.energy).toBe(46);
    expect(events[0]).toEqual({
      type: 'travelled',
      player: 'p1',
      from: 'a',
      to: 'e',
      mode: 'walk',
      minutes: 120,
      money: 0,
    });
    expect(events[1]).toEqual({
      type: 'statChanged',
      player: 'p1',
      stat: 'energy',
      from: 50,
      to: 46,
      cause: { kind: 'travel', mode: 'walk' },
    });
  });

  it('charges money for paid modes, as previewed', () => {
    const cab: Action = { type: 'travel', to: 'c', mode: 'cab' };
    expect(engine.preview(start(), cab)).toMatchObject({
      available: true,
      plan: { time: 45, money: 700, effects: [] },
    });
    const { state } = play(start(), cab);
    expect(p1(state).stats.cash).toBe(1300);
    expect(p1(state).timeLeft).toBe(555);
  });

  it('refuses trips to the current location, unknown places, unknown modes and missing items', () => {
    const state = start();
    expect(reason(state, walk('a'))).toBe('ALREADY_THERE');
    expect(reason(state, walk('zz'))).toBe('UNKNOWN_LOCATION');
    expect(reason(state, { type: 'travel', to: 'b', mode: 'jet' })).toBe('UNKNOWN_MODE');
    expect(reason(state, { type: 'travel', to: 'b', mode: 'bike' })).toBe('NEEDS_ITEM');
  });
});

describe('actions (FR-03)', () => {
  it('only allows actions at the current location', () => {
    expect(reason(start(), perform('snack'))).toBe('WRONG_LOCATION');
    expect(reason(start(), perform('nope'))).toBe('UNKNOWN_ACTION');
  });

  it('refuses actions the player cannot afford or fit in the week', () => {
    const atB = withStats(play(start(), walk('b')).state, { cash: 300 });
    expect(reason(atB, perform('snack'))).toBe('NOT_ENOUGH_MONEY');
    expect(reason(start(), perform('grind'))).toBeNull();
    const rested = play(start(), perform('rest')).state;
    expect(reason(rested, perform('grind'))).toBe('NOT_ENOUGH_TIME');
  });

  it('returns a rule error, not an exception, and leaves the state alone', () => {
    const state = start();
    expect(engine.reduce(state, perform('snack'))).toEqual({
      ok: false,
      error: { code: 'WRONG_LOCATION' },
    });
    expect(state).toEqual(start());
  });

  it('charges the cost, applies effects and counts meals', () => {
    const { state, events } = play(start(), walk('b'), perform('snack'));
    expect(p1(state).stats.cash).toBe(1600);
    expect(p1(state).stats.health).toBe(49);
    expect(p1(state).mealsThisWeek).toBe(1);
    const cause = { kind: 'action', id: 'snack' };
    expect(events.slice(-4)).toEqual([
      { type: 'actionPerformed', player: 'p1', actionId: 'snack', minutes: 60, money: 400 },
      {
        type: 'moneyMoved',
        player: 'p1',
        from: 'cash',
        to: 'outside',
        amount: 400,
        reason: 'spend',
        cause,
      },
      { type: 'statChanged', player: 'p1', stat: 'cash', from: 2000, to: 1600, cause },
      { type: 'statChanged', player: 'p1', stat: 'health', from: 50, to: 49, cause },
    ]);
  });

  it('clamps stats to their ranges and reports the real change', () => {
    const { state, events } = play(withStats(start(), { energy: 95 }), perform('rest'));
    expect(p1(state).stats.energy).toBe(100);
    expect(events[1]).toMatchObject({ type: 'statChanged', from: 95, to: 100 });
  });

  it('rolls ranged effects inside the previewed range', () => {
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const atB = play(start({ ...solo, seed }), walk('b')).state;
      expect(engine.preview(atB, perform('party'))).toMatchObject({
        plan: { outcomes: [{ stat: 'social', min: 2, max: 9 }] },
      });
      // The party also exhausts the player, so the week ends: look at the action's own change.
      const { events } = play(atB, perform('party'));
      const rolled = events.find(
        (e) => e.type === 'statChanged' && e.stat === 'social' && e.cause.kind === 'action',
      );
      if (rolled?.type !== 'statChanged') throw new Error('no social change');
      const gain = rolled.to - rolled.from;
      expect(gain).toBeGreaterThanOrEqual(2);
      expect(gain).toBeLessThanOrEqual(9);
    }
  });

  it('shows and applies the low-energy modifier on output gains only (FR-21)', () => {
    const atC = withStats(play(start(), walk('b'), walk('c')).state, { energy: 19 });
    expect(engine.preview(atC, perform('shift'))).toMatchObject({
      plan: {
        modifiers: [{ source: 'modifier.low-energy', target: 'workOutput', bp: -5000 }],
        effects: [
          { stat: 'cash', delta: 2000 },
          { stat: 'energy', delta: -15 },
        ],
      },
    });
    const { state } = play(atC, perform('shift'));
    expect(p1(state).stats.cash).toBe(4000);
  });
});

describe('ending the week (FR-04, FR-05)', () => {
  it('gives a rest bonus for unspent time, then runs the food check and drift', () => {
    const { state, events } = play(start(), walk('b'), endWeek);
    expect(events.filter((e) => e.type !== 'statChanged').map((e) => e.type)).toEqual([
      'travelled',
      'restBonus',
      'turnEnded',
      'mealSkipped',
      'marketMoved',
      'roundEnded',
      'turnStarted',
    ]);
    expect(events).toContainEqual({ type: 'restBonus', player: 'p1', minutes: 540, energy: 18 });
    // 50 − 2 walk + 18 rest − 10 hunger + 20 drift
    expect(p1(state).stats).toMatchObject({ energy: 76, health: 45, social: 47 });
    expect(state.history).toEqual([
      {
        week: 1,
        player: 'p1',
        cash: 2000,
        netWorth: 2000,
        progressBp: { wealth: 200, wellbeing: 5750, skills: 0, career: 0 },
      },
    ]);
  });

  it('previews the End Week rest bonus', () => {
    expect(engine.preview(start(), endWeek)).toMatchObject({
      available: true,
      plan: { time: 0, effects: [{ stat: 'energy', delta: 20 }] },
    });
  });

  it('skips the hunger penalty when the player ate', () => {
    const { events } = play(start(), walk('b'), perform('snack'), endWeek);
    expect(events.map((e) => e.type)).not.toContain('mealSkipped');
  });

  it('resets time, location, meals and RNG streams for the new week', () => {
    const { state } = play(start(), walk('b'), perform('party'));
    expect(state.week).toBe(2);
    expect(p1(state)).toMatchObject({ location: 'a', timeLeft: 600, mealsThisWeek: 0 });
    expect(state.rng).toEqual({});
  });

  it('ends the turn automatically when time runs out', () => {
    const { state, events } = play(start(), perform('grind'));
    expect(events).toContainEqual({ type: 'turnEnded', player: 'p1', reason: 'outOfTime' });
    expect(events.map((e) => e.type)).not.toContain('restBonus');
    expect(state.week).toBe(2);
  });

  it('forces rest when energy hits zero', () => {
    const { events } = play(start(), walk('b'), perform('party'));
    expect(events).toContainEqual({ type: 'turnEnded', player: 'p1', reason: 'exhausted' });
  });

  it('runs pipeline steps in order: per player after each turn, per round after everyone', () => {
    const calls: string[] = [];
    const pipeline: Pipeline = {
      perPlayer: ['food', 'bills', 'drift'].map((id) => ({
        id,
        run: ({ player }) => {
          calls.push(`${id}:${player.id}`);
          return { done: true };
        },
      })),
      perRound: ['market', 'news'].map((id) => ({
        id,
        run: () => {
          calls.push(id);
          return { done: true };
        },
      })),
    };
    const custom = createEngine(fixtureContent, { pipeline });
    const r1 = custom.reduce(custom.newGame(duo).state, endWeek);
    if (!r1.ok) throw new Error('endWeek is always legal');
    expect(calls).toEqual(['food:p1', 'bills:p1', 'drift:p1']);
    custom.reduce(r1.state, endWeek);
    expect(calls.slice(3)).toEqual(['food:p2', 'bills:p2', 'drift:p2', 'market', 'news']);
  });

  it('ends the game after the week limit (FR-12)', () => {
    const limited = start({ ...solo, config: { weekLimit: 2 } });
    const { state, events } = play(limited, endWeek, endWeek);
    const result = { reason: 'weekLimit', week: 2, winner: 'p1', scores: { p1: 1362 } };
    expect(state.phase).toEqual({ kind: 'gameOver', result });
    expect(events.at(-1)).toEqual({ type: 'gameOver', result });
    expect(engine.listActions(state)).toEqual([]);
    expect(engine.reduce(state, endWeek)).toEqual({ ok: false, error: { code: 'GAME_OVER' } });
  });
});

describe('decisions (engine-design §11)', () => {
  const pipeline: Pipeline = {
    perPlayer: [
      {
        id: 'dilemma',
        run: (ctx) => ({
          pause: {
            id: ctx.newId('decision'),
            player: ctx.player.id,
            stepId: 'dilemma',
            options: ['coffee', 'tea'],
          },
        }),
        resolve(ctx, _decision, optionId) {
          ctx.player.experience[optionId] = 1;
        },
      },
      { id: 'after', run: () => ({ done: true }) },
    ],
    perRound: [],
  };
  const custom = createEngine(fixtureContent, { pipeline });

  it('pauses for a human, allows only `decide`, then continues the pipeline', () => {
    const paused = custom.reduce(custom.newGame(solo).state, endWeek);
    if (!paused.ok) throw new Error('endWeek is always legal');
    const decision = paused.state.pending;
    expect(decision).toEqual({
      id: 'decision-1',
      player: 'p1',
      stepId: 'dilemma',
      options: ['coffee', 'tea'],
    });
    expect(paused.events.at(-1)).toEqual({ type: 'decisionRequired', decision });
    expect(custom.listActions(paused.state).map((o) => o.action)).toEqual([
      { type: 'decide', decisionId: 'decision-1', optionId: 'coffee' },
      { type: 'decide', decisionId: 'decision-1', optionId: 'tea' },
    ]);
    expect(custom.reduce(paused.state, endWeek)).toMatchObject({
      error: { code: 'DECISION_PENDING' },
    });
    const wrong = { type: 'decide', decisionId: 'decision-1', optionId: 'milk' } as const;
    expect(custom.reduce(paused.state, wrong)).toMatchObject({ error: { code: 'UNKNOWN_OPTION' } });

    const decided = custom.reduce(paused.state, { ...wrong, optionId: 'tea' });
    if (!decided.ok) throw new Error('tea is an option');
    expect(decided.state.pending).toBeNull();
    expect(p1(decided.state).experience).toEqual({ tea: 1 });
    expect(decided.state.week).toBe(2);
  });

  it('lets the AI policy decide for AI players on the spot', () => {
    const jones = { name: 'Jones', controller: 'ai' as const };
    const result = custom.reduce(
      custom.newGame({ seed: 's', players: [human('Ada'), jones] }).state,
      endWeek,
    );
    if (!result.ok) throw new Error('endWeek is always legal');
    // Ada's pending decision stops the loop before Jones plays.
    const decided = custom.reduce(result.state, {
      type: 'decide',
      decisionId: result.state.pending?.id ?? '',
      optionId: 'coffee',
    });
    if (!decided.ok) throw new Error('coffee is an option');
    expect(decided.events.map((e) => e.type)).toContain('decisionMade');
    expect(Object.keys(player(decided.state, 1).experience)).toHaveLength(1);
    expect(decided.state).toMatchObject({ week: 2, pending: null });
  });
});

describe('rounds and AI (FR-05a, FR-06, engine-design §7)', () => {
  it('plays everyone through the same week in turn order', () => {
    const r1 = play(start(duo), endWeek);
    expect(r1.state).toMatchObject({ week: 1, phase: { kind: 'turn', player: 'p2' } });
    expect(r1.events.at(-1)).toEqual({ type: 'turnStarted', player: 'p2', week: 1 });
    expect(r1.events.map((e) => e.type)).not.toContain('roundEnded');

    const r2 = play(r1.state, endWeek);
    expect(r2.state).toMatchObject({ week: 2, phase: { kind: 'turn', player: 'p1' } });
    expect(r2.events.at(-1)).toEqual({ type: 'turnStarted', player: 'p1', week: 2 });
  });

  it('applies actions to the active player only', () => {
    const { state } = play(start(duo), endWeek, walk('b'));
    expect(player(state, 0).location).toBe('a');
    expect(player(state, 1).location).toBe('b');
  });

  it('plays AI turns inside the engine until a human has to act', () => {
    const jones = { name: 'Jones', controller: 'ai' as const };
    const { state, events } = play(start({ seed: 's', players: [human('Ada'), jones] }), endWeek);
    expect(state).toMatchObject({ week: 2, phase: { kind: 'turn', player: 'p1' } });
    expect(events).toContainEqual({ type: 'turnStarted', player: 'p2', week: 1 });
    expect(events).toContainEqual({ type: 'turnEnded', player: 'p2', reason: expect.any(String) });
    expect(Object.keys(state.rng)).toEqual([]);
  });
});

describe('listActions', () => {
  it('lists every trip, the actions here and End Week, each with availability', () => {
    const options = engine.listActions(start());
    const find = (a: Action) => options.find((o) => JSON.stringify(o.action) === JSON.stringify(a));
    expect(find(walk('c'))?.available).toBe(true);
    expect(find({ type: 'travel', to: 'c', mode: 'bike' })).toMatchObject({
      available: false,
      reason: { code: 'NEEDS_ITEM' },
    });
    expect(find(walk('a'))).toMatchObject({ reason: { code: 'ALREADY_THERE' } });
    expect(find(perform('rest'))?.available).toBe(true);
    expect(find(perform('snack'))).toBeUndefined();
    expect(options.at(-1)).toMatchObject({ action: endWeek, available: true });
  });
});
