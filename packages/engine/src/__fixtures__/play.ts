/** Test helpers: start a fixture game, play actions, and poke state into shape for one rule. */
import type { GameContent } from '@fastlane/content';
import { clone } from '../core/clone.ts';
import { createEngine, type Engine } from '../core/reduce.ts';
import type { Action, PerformParams } from '../types/actions.ts';
import type { DomainEvent } from '../types/events.ts';
import type { GameSetup, GameState, PlayerState } from '../types/state.ts';
import { fixtureContent } from './content.ts';

export const human = (name: string) => ({ name, controller: 'human' as const });
export const solo: GameSetup = { seed: 'test', players: [human('Ada')] };

export function harness(content: GameContent = fixtureContent) {
  const engine: Engine = createEngine(content);
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

  const reason = (state: GameState, action: Action) => {
    const preview = engine.preview(state, action);
    return preview.available ? null : preview.reason.code;
  };

  return { engine, start, play, reason };
}

export function player(s: GameState, i = 0): PlayerState {
  const p = s.players[i];
  if (!p) throw new Error(`no player ${i}`);
  return p;
}

/** A copy of `state` with player `i` changed by `edit`. */
export function edit(state: GameState, change: (p: PlayerState) => void, i = 0): GameState {
  const copy = clone(state);
  change(player(copy, i));
  return copy;
}

export const walk = (to: string): Action => ({ type: 'travel', to, mode: 'walk' });
export const perform = (actionId: string, params: PerformParams = {}): Action => ({
  type: 'perform',
  actionId,
  ...params,
});
export const endWeek: Action = { type: 'endWeek' };

export const eventsOf = <T extends DomainEvent['type']>(events: DomainEvent[], type: T) =>
  events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
