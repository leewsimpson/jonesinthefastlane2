import { defaultContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { clone } from './clone.ts';
import { createEngine } from './engine.ts';
import { canonicalJson, hashValue } from './hash.ts';
import {
  createSave,
  loadSave,
  SAVE_VERSION,
  SaveError,
  serializeSave,
  verifySave,
} from './save.ts';
import type { GameAction } from './types.ts';

const engine = createEngine(defaultContent);
const setup = { seed: 'save-test', players: [{ name: 'Ada', kind: 'human' as const }] };

function sampleGame() {
  let state = engine.newGame(setup);
  const actions: GameAction[] = [];
  for (let i = 0; i < 40; i++) {
    const legal = engine.legalActions(state);
    const action = legal[(i * 7) % legal.length] as GameAction;
    actions.push(action);
    state = engine.reduce(state, action).state;
  }
  return { state, actions };
}

describe('saves', () => {
  it('round-trips through JSON and verifies by replay', () => {
    const { state, actions } = sampleGame();
    const loaded = loadSave(serializeSave(createSave(engine, setup, actions, state)));
    expect(loaded.state).toEqual(state);
    expect(loaded.saveVersion).toBe(SAVE_VERSION);
    expect(verifySave(engine, loaded)).toBe(true);
  });

  it('fails verification when the log or state was tampered with', () => {
    const { state, actions } = sampleGame();
    const save = createSave(engine, setup, actions, state);
    expect(verifySave(engine, { ...save, actions: actions.slice(0, -1) })).toBe(false);
    const richer = clone(state);
    const p = richer.players[0];
    if (p) p.stats.cash += 1000;
    expect(verifySave(engine, { ...save, state: richer })).toBe(false);
  });

  it('runs migrations from older versions in order', () => {
    const old = JSON.stringify({ saveVersion: SAVE_VERSION - 1, legacy: true });
    const migrated = loadSave(old, {
      [SAVE_VERSION - 1]: ({ legacy: _, ...rest }) => ({ ...rest, migrated: true }),
    });
    expect(migrated).toEqual({ saveVersion: SAVE_VERSION, migrated: true });
  });

  it('rejects unreadable, unversioned, unmigratable and future saves', () => {
    expect(() => loadSave('{')).toThrow(SaveError);
    expect(() => loadSave('[]')).toThrow(SaveError);
    expect(() => loadSave('{}')).toThrow(SaveError);
    expect(() => loadSave(JSON.stringify({ saveVersion: SAVE_VERSION - 1 }))).toThrow(
      /no migration/,
    );
    expect(() => loadSave(JSON.stringify({ saveVersion: SAVE_VERSION + 1 }))).toThrow(/newer/);
  });
});

describe('hash', () => {
  it('ignores object key order but not values', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});
