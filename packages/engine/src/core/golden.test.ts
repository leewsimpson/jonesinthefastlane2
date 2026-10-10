/**
 * Golden fixtures: seed + log → state hash (engine-design §15). They catch accidental determinism changes. When a
 * rule change moves them on purpose, update them with `vitest -u` and bump ENGINE_VERSION in the same commit.
 */
import { defaultContent, type GameContent } from '@fastlane/content';
import { expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { createRng } from '../rng/rng.ts';
import type { Action } from '../types/actions.ts';
import type { GameSetup } from '../types/state.ts';
import { createEngine } from './reduce.ts';

const setup: GameSetup = {
  seed: 'golden',
  players: [
    { name: 'Ada', controller: 'human' },
    { name: 'Jones', controller: 'ai' },
  ],
  config: { weekLimit: 12 },
};

/** Plays to the week limit, picking among the available options with a fixed chooser. */
function goldenRun(content: GameContent) {
  const engine = createEngine(content);
  const chooser = createRng('golden-chooser');
  let { state } = engine.newGame(setup);
  const log: Action[] = [];
  while (state.phase.kind !== 'gameOver') {
    const options = engine.listActions(state).filter((o) => o.available);
    const option = options[chooser.int(0, options.length - 1)];
    if (!option) throw new Error('no available action');
    log.push(option.action);
    const result = engine.reduce(state, option.action);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
  }
  return { actions: log.length, week: state.week, hash: engine.hash(state) };
}

it('fixture content: the same seed and log give the pinned hash', () => {
  expect(goldenRun(fixtureContent)).toMatchInlineSnapshot(`
    {
      "actions": 84,
      "hash": "1810b73a7840981674c09dd9a9c2",
      "week": 12,
    }
  `);
});

it('shipped content: the same seed and log give the pinned hash', () => {
  expect(goldenRun(defaultContent)).toMatchInlineSnapshot(`
    {
      "actions": 278,
      "hash": "1a2092aa09bb361ef74c9c0c5b5b",
      "week": 12,
    }
  `);
});
