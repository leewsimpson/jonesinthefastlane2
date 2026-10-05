/** Property tests over random legal play (tech-stack §6), on both fixture and shipped content. */
import { defaultContent, type GameContent, STAT_KEYS } from '@fastlane/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from './__fixtures__/content.ts';
import { clone } from './clone.ts';
import { createEngine } from './engine.ts';
import type { GameAction, GameSetup, GameState } from './types.ts';

const setupArb = fc.record({
  seed: fc.string(),
  players: fc.array(
    fc.record({ name: fc.constant('P'), kind: fc.constantFrom('human' as const, 'ai' as const) }),
    { minLength: 1, maxLength: 4 },
  ),
});
/** Each number picks one of the legal actions at that point, so every generated game is legal. */
const choicesArb = fc.array(fc.nat(), { maxLength: 150 });

function playOut(content: GameContent, setup: GameSetup, choices: number[]) {
  const engine = createEngine(content);
  let state = engine.newGame(setup);
  const actions: GameAction[] = [];
  const states: GameState[] = [state];
  for (const choice of choices) {
    const legal = engine.legalActions(state);
    const action = legal[choice % legal.length] as GameAction;
    actions.push(action);
    state = engine.reduce(state, action).state;
    states.push(state);
  }
  return { engine, state, actions, states };
}

const contents: [string, GameContent][] = [
  ['fixture', fixtureContent],
  ['shipped', defaultContent],
];

for (const [name, content] of contents) {
  describe(`properties (${name} content)`, () => {
    it('keeps every stat inside its range', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          for (const state of playOut(content, setup, choices).states) {
            for (const p of state.players) {
              expect(p.hoursLeft).toBeGreaterThanOrEqual(0);
              expect(p.hoursLeft).toBeLessThanOrEqual(content.balance.weekHours);
              for (const key of STAT_KEYS) {
                const { min, max } = content.balance.statRanges[key];
                expect(p.stats[key]).toBeGreaterThanOrEqual(min);
                if (max !== null) expect(p.stats[key]).toBeLessThanOrEqual(max);
              }
            }
          }
        }),
      );
    });

    it('replays a setup and action log to the identical state hash', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          const { engine, state, actions } = playOut(content, setup, choices);
          const replayed = engine.replay(setup, actions);
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
          for (const action of engine.legalActions(state)) engine.previewAction(state, action);
          expect(state).toEqual(before);
        }),
      );
    });

    it('never mutates the state passed to reduce', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, fc.nat(), (setup, choices, pick) => {
          const { engine, state } = playOut(content, setup, choices);
          const before = clone(state);
          const legal = engine.legalActions(state);
          engine.reduce(state, legal[pick % legal.length] as GameAction);
          expect(state).toEqual(before);
        }),
      );
    });

    it('applies what the preview promised, clamped to stat ranges', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, fc.nat(), (setup, choices, pick) => {
          const { engine, state } = playOut(content, setup, choices);
          const legal = engine.legalActions(state);
          const action = legal[pick % legal.length] as GameAction;
          if (action.type === 'endWeek') return;
          const preview = engine.previewAction(state, action);
          const [first] = engine.reduce(state, action).events;
          if (first?.type !== 'travelled' && first?.type !== 'performed')
            throw new Error('expected the action result first');
          expect(first.hours).toBe(preview.hours);
          const stats = state.players[state.turn]?.stats;
          if (!stats) throw new Error('no current player');
          for (const key of STAT_KEYS) {
            const range = preview.effects[key] ?? { min: 0, max: 0 };
            const { min, max } = content.balance.statRanges[key];
            const bound = (v: number) =>
              Math.min(Math.max(v, min), max ?? Number.POSITIVE_INFINITY);
            const after = stats[key] + (first.changes[key] ?? 0);
            expect(after).toBeGreaterThanOrEqual(bound(stats[key] + range.min));
            expect(after).toBeLessThanOrEqual(bound(stats[key] + range.max));
          }
        }),
      );
    });

    it('always offers End Week, so no state is stuck', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          const { engine, state } = playOut(content, setup, choices);
          expect(engine.legalActions(state)).toContainEqual({ type: 'endWeek' });
        }),
      );
    });
  });
}
