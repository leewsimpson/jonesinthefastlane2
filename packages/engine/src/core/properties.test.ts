/** Property tests over random legal play (engine-design §15), on both fixture and shipped content. */
import { defaultContent, type GameContent, STAT_KEYS } from '@fastlane/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import type { Action, Preview } from '../types/actions.ts';
import type { GameSetup, GameState } from '../types/state.ts';
import { clone } from './clone.ts';
import { createEngine } from './reduce.ts';

const setupArb: fc.Arbitrary<GameSetup> = fc.record({
  seed: fc.string(),
  players: fc
    .array(fc.constantFrom('human' as const, 'ai' as const), { minLength: 1, maxLength: 5 })
    .filter((cs) => cs.includes('human') && cs.filter((c) => c === 'human').length <= 4)
    .map((cs) => cs.map((controller) => ({ name: 'P', controller }))),
});
/** Each number picks one of the available options at that point, so every generated game is legal. */
const choicesArb = fc.array(fc.nat(), { maxLength: 150 });

const available = (options: Preview[]) => options.filter((o) => o.available);

function playOut(content: GameContent, setup: GameSetup, choices: number[]) {
  const engine = createEngine(content);
  let { state } = engine.newGame(setup);
  const log: Action[] = [];
  const states: GameState[] = [state];
  for (const choice of choices) {
    const options = available(engine.listActions(state));
    const option = options[choice % options.length];
    if (!option) throw new Error('no available action');
    log.push(option.action);
    const result = engine.reduce(state, option.action);
    if (!result.ok) throw new Error(`available action refused: ${result.error.code}`);
    state = result.state;
    states.push(state);
  }
  return { engine, state, log, states };
}

/** Freeze deeply, so any write to a state the engine was handed throws. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const contents: [string, GameContent][] = [
  ['fixture', fixtureContent],
  ['shipped', defaultContent],
];

for (const [name, content] of contents) {
  describe(`properties (${name} content)`, () => {
    it('keeps every stat in range and time and cash non-negative', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          for (const state of playOut(content, setup, choices).states) {
            for (const p of state.players) {
              expect(p.timeLeft).toBeGreaterThanOrEqual(0);
              expect(p.timeLeft).toBeLessThanOrEqual(content.balance.weekMinutes);
              for (const key of STAT_KEYS) {
                const { min, max } = content.balance.statRanges[key];
                expect(Number.isInteger(p.stats[key])).toBe(true);
                expect(p.stats[key]).toBeGreaterThanOrEqual(min);
                if (max !== null) expect(p.stats[key]).toBeLessThanOrEqual(max);
              }
            }
          }
        }),
      );
    });

    it('replays a setup and human log to the identical state', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          const { engine, state, log } = playOut(content, setup, choices);
          const replayed = engine.replay(setup, log);
          expect(engine.hash(replayed)).toBe(engine.hash(state));
          expect(replayed).toEqual(state);
        }),
      );
    });

    it('never changes state or consumes RNG when previewing or listing actions', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          const { engine, state } = playOut(content, setup, choices);
          const before = clone(state);
          for (const option of engine.listActions(state)) engine.preview(state, option.action);
          expect(state).toEqual(before);
        }),
      );
    });

    it('never mutates the state passed to reduce, even on a rule error', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, fc.nat(), (setup, choices, pick) => {
          const { engine, state } = playOut(content, setup, choices);
          const frozen = deepFreeze(clone(state));
          const options = engine.listActions(frozen);
          const option = options[pick % options.length];
          if (!option) return;
          const result = engine.reduce(frozen, option.action);
          expect(result.ok).toBe(option.available);
          expect(frozen).toEqual(state);
        }),
      );
    });

    it('applies what the preview promised', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, fc.nat(), (setup, choices, pick) => {
          const { engine, state } = playOut(content, setup, choices);
          const options = available(engine.listActions(state));
          const option = options[pick % options.length];
          if (!option?.available) return;
          const { action, plan } = option;
          if (action.type !== 'travel' && action.type !== 'perform') return;
          const result = engine.reduce(state, action);
          if (!result.ok) throw new Error('available action refused');
          const [first] = result.events;
          expect(first).toMatchObject({ minutes: plan.time, money: plan.money });
          // Each stat ends within [start + shown min, start + shown max], clamped to its range.
          const playerId = state.phase.kind === 'turn' ? state.phase.player : '';
          const before = state.players.find((p) => p.id === playerId)?.stats;
          if (!before) throw new Error('no active player');
          for (const key of STAT_KEYS) {
            const shown = [
              ...plan.effects.filter((d) => d.stat === key).map((d) => [d.delta, d.delta]),
              ...plan.outcomes.filter((d) => d.stat === key).map((d) => [d.min, d.max]),
            ];
            const lo = shown.reduce(
              (sum, [min]) => sum + (min ?? 0),
              key === 'cash' ? -plan.money : 0,
            );
            const hi = shown.reduce(
              (sum, [, max]) => sum + (max ?? 0),
              key === 'cash' ? -plan.money : 0,
            );
            let after = before[key];
            for (const e of result.events)
              if (
                e.type === 'statChanged' &&
                e.player === playerId &&
                e.stat === key &&
                (e.cause.kind === 'action' || e.cause.kind === 'travel')
              )
                after += e.to - e.from;
            const { min, max } = content.balance.statRanges[key];
            const bound = (v: number) =>
              Math.min(Math.max(v, min), max ?? Number.POSITIVE_INFINITY);
            expect(after).toBeGreaterThanOrEqual(bound(before[key] + lo));
            expect(after).toBeLessThanOrEqual(bound(before[key] + hi));
          }
          // Savings, investments, the deposit and debts move exactly as the plan's transfers said.
          const offCash = (from: string, to: string) =>
            ![from, to].every((p) => p === 'cash' || p === 'outside');
          const moved = result.events.flatMap((e) =>
            e.type === 'moneyMoved' &&
            e.player === playerId &&
            e.cause.kind === 'action' &&
            offCash(e.from, e.to)
              ? [{ from: e.from, to: e.to, amount: e.amount }]
              : [],
          );
          expect(moved).toEqual(plan.transfers.filter((t) => offCash(t.from, t.to)));
        }),
      );
    });

    it('always offers End Week to a human on their turn, so no state is stuck', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          const { engine, state } = playOut(content, setup, choices);
          if (state.pending) return;
          expect(available(engine.listActions(state)).map((o) => o.action)).toContainEqual({
            type: 'endWeek',
          });
        }),
      );
    });
  });
}
