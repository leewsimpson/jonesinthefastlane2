import { defaultContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { clone } from '../core/clone.ts';
import { canonicalJson, hashValue } from '../core/hash.ts';
import { createEngine } from '../core/reduce.ts';
import type { Action } from '../types/actions.ts';
import type { GameSetup } from '../types/state.ts';
import {
  createSave,
  loadSave,
  SAVE_VERSION,
  SaveError,
  serializeSave,
  verifySave,
} from './index.ts';

const engine = createEngine(defaultContent);
const setup: GameSetup = {
  seed: 'save-test',
  players: [
    { name: 'Ada', controller: 'human' },
    { name: 'Jones', controller: 'ai' },
  ],
};

function sampleGame() {
  let { state } = engine.newGame(setup);
  const log: Action[] = [];
  for (let i = 0; i < 40; i++) {
    const options = engine.listActions(state).filter((o) => o.available);
    const action = options[(i * 7) % options.length]?.action ?? { type: 'endWeek' };
    log.push(action);
    const result = engine.reduce(state, action);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
  }
  return { state, log };
}

describe('saves', () => {
  it('round-trips through JSON and verifies by replay', () => {
    const { state, log } = sampleGame();
    const loaded = loadSave(serializeSave(createSave(engine, setup, log, state)));
    expect(loaded.snapshot).toEqual(state);
    expect(loaded.saveVersion).toBe(SAVE_VERSION);
    expect(verifySave(engine, loaded)).toEqual({ ok: true });
  });

  it('fails verification when the log or snapshot was tampered with', () => {
    const { state, log } = sampleGame();
    const save = createSave(engine, setup, log, state);
    expect(verifySave(engine, { ...save, log: log.slice(0, -1) })).toEqual({
      ok: false,
      reason: 'diverged',
    });
    const richer = clone(state);
    const p = richer.players[0];
    if (p) p.stats.cash += 1000;
    expect(verifySave(engine, { ...save, snapshot: richer })).toMatchObject({ reason: 'diverged' });
    const bogus: Action = { type: 'travel', to: 'atlantis', mode: 'walk' };
    expect(verifySave(engine, { ...save, log: [bogus] })).toMatchObject({ reason: 'illegal' });
  });

  it('refuses to replay under a different engine or content', () => {
    const { state, log } = sampleGame();
    const save = createSave(engine, setup, log, state);
    expect(verifySave(engine, { ...save, engineVersion: '0.0.1' })).toMatchObject({
      reason: 'incompatible',
    });
    expect(verifySave(engine, { ...save, contentHash: 'x' })).toMatchObject({
      reason: 'incompatible',
    });
  });

  it('runs migrations from older versions in order', () => {
    const old = { format: 'fastlane-save', saveVersion: SAVE_VERSION - 1, legacy: true };
    const migrated = loadSave(JSON.stringify(old), {
      [SAVE_VERSION - 1]: ({ legacy: _, ...rest }) => ({ ...rest, migrated: true }),
    });
    expect(migrated).toEqual({
      format: 'fastlane-save',
      saveVersion: SAVE_VERSION,
      migrated: true,
    });
  });

  it('rejects unreadable, foreign, unversioned, unmigratable and future saves', () => {
    const save = (fields: object) => JSON.stringify({ format: 'fastlane-save', ...fields });
    expect(() => loadSave('{')).toThrow(SaveError);
    expect(() => loadSave('[]')).toThrow(SaveError);
    expect(() => loadSave('{"saveVersion":1}')).toThrow(/not a Fast Lane save/);
    expect(() => loadSave(save({}))).toThrow(/no version/);
    expect(() => loadSave(save({ saveVersion: SAVE_VERSION - 1 }))).toThrow(/no migration/);
    expect(() => loadSave(save({ saveVersion: SAVE_VERSION + 1 }))).toThrow(/newer/);
  });
});

describe('hash', () => {
  it('ignores object key order but not values', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});
