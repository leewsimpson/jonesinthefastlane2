/**
 * Save migration test (tech-stack §4, implementation-plan Phase 6): every save fixture in `__fixtures__` was captured
 * from a shipped build (`packages/sim/scripts/capture-save.ts`) and must still load and play in this one. Bumping
 * `SAVE_VERSION` without a migration, or changing content so an old snapshot no longer fits, fails here.
 */
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { hashValue } from '@fastlane/engine';
import { SAVE_VERSION } from '@fastlane/engine/save';
import { describe, expect, it } from 'vitest';
import { createGameStore } from '../store/game.ts';
import { fromJson, openSaves } from './saves.ts';

const dir = new URL('./__fixtures__/', import.meta.url);
const fixtures = readdirSync(dir).filter((f) => /^save-v\d+-.+\.json$/.test(f));

describe('saves from earlier builds', () => {
  it('has a fixture for the current save version', () => {
    expect(fixtures.some((f) => f.startsWith(`save-v${SAVE_VERSION}-`))).toBe(true);
  });

  for (const file of fixtures) {
    const json = readFileSync(new URL(file, dir), 'utf8');

    it(`${file} loads, reopens its weekend choice and plays on`, async () => {
      const loaded = fromJson('beta', json);
      const store = createGameStore();
      store.getState().resume(loaded);
      const pending = store.getState().session?.state.pending;
      expect(pending, 'fixture was captured on a weekend choice').toBeTruthy();
      expect(store.getState().report).not.toBeNull();

      const startWeek = loaded.state.week;
      // Answer the open card, then play three more weeks by ending each one.
      for (let guard = 0; guard < 50; guard++) {
        const s = store.getState();
        const state = s.session?.state;
        if (!state || state.week >= startWeek + 3 || state.phase.kind === 'gameOver') break;
        if (state.pending) {
          const ok = s.dispatch({
            type: 'decide',
            decisionId: state.pending.id,
            optionId: state.pending.options[0] ?? '',
          });
          expect(ok, JSON.stringify(s.error)).toBe(true);
        } else if (s.report) s.nextStep();
        else expect(s.dispatch({ type: 'endWeek' }), JSON.stringify(s.error)).toBe(true);
      }
      const session = store.getState().session;
      expect(session?.state.week).toBeGreaterThanOrEqual(startWeek + 3);

      // And the continued game saves and reloads in this build's format.
      const saves = openSaves(`beta-${Math.random()}`);
      if (!session) throw new Error('no session');
      await saves.write(session);
      const again = await saves.read(session.id);
      expect(hashValue(again.state)).toBe(hashValue(session.state));
    });
  }
});
