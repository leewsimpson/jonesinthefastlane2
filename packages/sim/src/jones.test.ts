/**
 * Phase 3 exit criterion: a full game, human-scripted vs Jones, runs headless with events, news and teasers
 * (implementation-plan Phase 3). The human seat is the scripted sensible strategy; Jones is the engine's AI seat on
 * shipped content. Every game must end, show each hook, and replay to the same state.
 */
import { defaultContent } from '@fastlane/content';
import {
  createEngine,
  type DomainEvent,
  type Engine,
  type GameSetup,
  goalValues,
  progressBp,
  scoreBp,
} from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { idleBot } from './bots/policies.ts';
import { sensibleBot } from './bots/sensible.ts';
import type { Bot } from './game.ts';

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

/** Plays `weeks` weeks against `human`, calling `atWeekStart(week, jones progress)` as each new week begins. */
function watchJones(
  eng: Engine,
  seed: string,
  human: Bot,
  weeks: number,
  atWeekStart: (week: number, progress: ReturnType<typeof progressBp>) => void,
) {
  const { state } = eng.newGame({
    seed,
    players: [
      { name: 'Ada', controller: 'human' },
      { name: 'Jones', controller: 'ai' },
    ],
    config: { difficulty: 'standard', weekLimit: 52 },
  });
  let seen = 0;
  while (state.phase.kind !== 'gameOver' && state.week <= weeks) {
    if (state.week !== seen) {
      seen = state.week;
      const jones = state.players[1];
      if (!jones) throw new Error('no Jones');
      atWeekStart(state.week, progressBp(goalValues(eng.content, jones), state.config.goals));
    }
    const result = eng.reduceInPlace(state, human.choose(eng, state));
    if (!result.ok) throw new Error(result.error.code);
  }
  return state;
}

describe('Jones plays a credible week-to-week game (FR-80, FR-83)', () => {
  const seeds = Array.from({ length: 10 }, (_, i) => `jt-${i}`);
  const wealthAt = new Map<number, number[]>();
  let belowFull = 0;
  let pinnedWeeks = 0;
  let biggestSkillsJump = 0;
  for (const seed of seeds) {
    let skills = 0;
    watchJones(engine, seed, sensibleBot, 26, (week, p) => {
      wealthAt.set(week, [...(wealthAt.get(week) ?? []), p.wealth]);
      if (week > 2) {
        pinnedWeeks++;
        if (p.wellbeing < 10_000) belowFull++;
      }
      if (week > 1) biggestSkillsJump = Math.max(biggestSkillsJump, p.skills - skills);
      skills = p.skills;
    });
  }
  const mean = (week: number) => {
    const xs = wealthAt.get(week) ?? [];
    return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  };

  it('earns real money: Wealth rises steadily and is well off the floor by week 12', () => {
    expect(mean(12)).toBeGreaterThan(800);
    expect(mean(8)).toBeLessThan(mean(12));
    expect(mean(12)).toBeLessThan(mean(16));
    expect(mean(16)).toBeLessThan(mean(20));
  });

  it('pays Social and Happiness upkeep: Wellbeing is not pinned at 100% every week', () => {
    expect(belowFull).toBeGreaterThanOrEqual(Math.ceil(pinnedWeeks * 0.03));
  });

  it('grows Skills at a plausible pace, never most of the goal in one week', () => {
    expect(biggestSkillsJump).toBeLessThanOrEqual(4500);
  });

  it('is held back by the rubber band when far ahead, without any change to the rules', () => {
    const band = defaultContent.ai.rubberBand;
    const unbanded = createEngine({
      ...defaultContent,
      ai: { ...defaultContent.ai, rubberBand: { ...band, thresholdBp: 10_000, spanBp: 1 } },
    });
    // An idle human leaves Jones far in front, so the band is at full strength.
    const score = (eng: Engine) => {
      let total = 0;
      for (const seed of seeds.slice(0, 6)) {
        const state = watchJones(eng, seed, idleBot, 20, () => {});
        const jones = state.players[1];
        if (!jones) throw new Error('no Jones');
        total += scoreBp(progressBp(goalValues(defaultContent, jones), state.config.goals));
      }
      return total / 6;
    };
    expect(score(engine)).toBeLessThan(score(unbanded) - 200);
  });
});
