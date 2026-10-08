import { describe, expect, it } from 'vitest';
import { engine } from '../../game/engine.ts';
import { groupActions } from '../panels/ActionSheet.tsx';
import { keyLabel, keyName, ROW_KEYS, rowKey } from './hotkeys.ts';

describe('row shortcuts (NFR-03)', () => {
  it('names and labels shifted keys', () => {
    expect(keyName({ key: 'A', shiftKey: true })).toBe('shift+a');
    expect(keyName({ key: 'a', shiftKey: false })).toBe('a');
    expect(keyName({ key: '!', shiftKey: true })).toBe('!');
    expect(keyLabel('shift+a')).toBe('⇧A');
    expect(keyLabel('7')).toBe('7');
    expect(new Set(ROW_KEYS).size).toBe(ROW_KEYS.length);
  });

  it('gives every takeable row a key at a fully stocked NeoBank', () => {
    const { state } = engine.newGame({
      seed: 'keys',
      players: [{ name: 'Ana', controller: 'human' }],
    });
    const me = state.players[0];
    if (!me) throw new Error('no player');
    me.location = 'neobank';
    me.stats.cash = 5_000_000;
    for (const id of Object.keys(me.holdings)) me.holdings[id] = 1_000_000;
    for (const debt of Object.values(me.debts)) debt.balance = 500_000;
    const rows = groupActions(engine.listActions(state), rowKey).flatMap((g) => g.rows);
    const takeable = rows.filter((r) => r.preview.available);
    expect(takeable.length).toBeGreaterThan(30); // more than the plain keys
    for (const r of takeable) expect(r.key, JSON.stringify(r.preview.action)).toBeDefined();
  });
});
