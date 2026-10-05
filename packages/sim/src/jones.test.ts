/**
 * Phase 3 exit criterion: a full game, human-scripted vs Jones, runs headless with events, news and teasers
 * (implementation-plan Phase 3). The human seat is the scripted sensible strategy; Jones is the engine's AI seat on
 * shipped content. Every game must end, show each hook, and replay to the same state.
 */
import { defaultContent } from '@fastlane/content';
import { createEngine, type DomainEvent, type GameSetup } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { sensibleBot } from './bots/sensible.ts';

const engine = createEngine(defaultContent);

function play(setup: GameSetup) {
  const { state, events } = engine.newGame(setup);
  const seen: DomainEvent[] = [...events];
  const log = [];
  while (state.phase.kind !== 'gameOver') {
    const action = sensibleBot.choose(engine, state);
    const result = engine.reduceInPlace(state, action);
    if (!result.ok) throw new Error(`${JSON.stringify(action)}: ${result.error.code}`);
    log.push(action);
    seen.push(...result.events);
  }
  return { state, log, seen };
}

describe('human-scripted vs Jones (Phase 3 exit criterion)', () => {
  const games = ['jones-1', 'jones-2', 'jones-3'].map((seed) => {
    const setup: GameSetup = {
      seed,
      players: [
        { name: 'Ada', controller: 'human' },
        { name: 'Jones', controller: 'ai' },
      ],
      config: { difficulty: 'standard', weekLimit: 52 },
    };
    return { setup, ...play(setup) };
  });

  it('plays to the end with weekend events, news, teasers, quests and Jones posting', () => {
    for (const { state, seen } of games) {
      expect(state.phase.kind).toBe('gameOver');
      const types = new Set(seen.map((e) => e.type));
      for (const type of [
        'weekendEvent',
        'eventResolved',
        'newsStarted',
        'teaser',
        'questIssued',
        'questCompleted',
        'rivalPost',
        'standings',
      ] as const)
        expect([type, types.has(type)]).toEqual([type, true]);
      // Jones is a real opponent: it takes actions and makes its own event choices.
      expect(seen.some((e) => e.type === 'actionPerformed' && e.player === 'p2')).toBe(true);
      expect(seen.some((e) => e.type === 'eventResolved' && e.player === 'p2')).toBe(true);
    }
  });

  it('replays every game, Jones included, to the identical state', () => {
    for (const g of games)
      expect(engine.hash(engine.replay(g.setup, g.log))).toBe(engine.hash(g.state));
  });
});
