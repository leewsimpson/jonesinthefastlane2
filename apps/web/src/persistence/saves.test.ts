import 'fake-indexeddb/auto';
import { hashValue } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { createGameStore, type Session } from '../store/game.ts';
import { fromJson, openSaves } from './saves.ts';

/** A value the test needs, or a clear failure. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

function playedSession(): Session {
  const store = createGameStore();
  store.getState().start('slot-a', {
    seed: 'save-test',
    players: [
      { name: 'Ana', controller: 'human' },
      { name: 'Jones', controller: 'ai' },
    ],
  });
  store.getState().dispatch({ type: 'travel', to: 'joblink', mode: 'transit' });
  return must(store.getState().session, 'session');
}

describe('save slots (NFR-13)', () => {
  it('round-trips a session through IndexedDB', async () => {
    const saves = openSaves(`test-${Math.random()}`);
    const session = playedSession();
    await saves.write(session);
    const [slot] = await saves.list();
    expect(slot).toMatchObject({
      id: 'slot-a',
      week: 1,
      players: ['Ana', 'Jones'],
      finished: false,
    });
    const loaded = await saves.read('slot-a');
    expect(loaded.log).toEqual(session.log);
    expect(hashValue(loaded.state)).toBe(hashValue(session.state));
    await saves.remove('slot-a');
    expect(await saves.list()).toEqual([]);
  });

  it('lists the newest slot first', async () => {
    const saves = openSaves(`test-${Math.random()}`);
    const session = playedSession();
    await saves.write({ ...session, id: 'old' });
    await new Promise((r) => setTimeout(r, 5));
    await saves.write({ ...session, id: 'new' });
    expect((await saves.list()).map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('rejects saves that are not saves', () => {
    expect(() => fromJson('x', '{"format":"something-else"}')).toThrow();
    expect(() => fromJson('x', 'not json')).toThrow();
    const broken = JSON.stringify({
      format: 'fastlane-save',
      saveVersion: 3,
      engineVersion: '0',
      contentHash: '',
      setup: { seed: 's', players: [] },
      log: [],
      snapshot: {},
      snapshotHash: '',
    });
    expect(() => fromJson('x', broken)).toThrow();
  });
});
