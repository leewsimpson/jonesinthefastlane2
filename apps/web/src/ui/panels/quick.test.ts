import type { GameState, SmartDefault } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { content, engine } from '../../game/engine.ts';
import { rowKey } from '../common/hotkeys.ts';
import { groupActions, quickLabel } from './ActionSheet.tsx';

const at = (location: string, patch: (s: GameState) => void = () => {}): GameState => {
  const { state } = engine.newGame({
    seed: 'quick',
    players: [{ name: 'Ana', controller: 'human' }],
  });
  const me = state.players[0];
  if (!me) throw new Error('no player');
  me.location = location;
  patch(state);
  return state;
};

describe('quick moves (ENG-02)', () => {
  it('labels the longest shift on offer as a full shift', () => {
    const job = content.city.jobs.find((j) => j.location === 'burger-bot');
    if (!job) throw new Error('no burger bot job');
    const state = at('burger-bot', (s) => {
      const me = s.players[0];
      if (me) {
        me.job = { id: job.id, rating: 50, minutesThisWeek: 0 } as never;
        me.mealsThisWeek = 1;
      }
    });
    const groups = groupActions(engine.listActions(state), rowKey);
    const [work] = engine.smartDefaults(state);
    expect(work?.kind).toBe('work');
    expect(quickLabel(work as SmartDefault, groups)).toMatch(/^Work full shift · /);
  });

  it('offers a meal first when the player has not eaten', () => {
    const state = at('burger-bot');
    const smart = engine.smartDefaults(state);
    expect(smart[0]?.kind).toBe('eat');
    expect(quickLabel(smart[0] as SmartDefault, [])).toMatch(/^Eat now: /);
  });
});
