import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n/i18n.ts';
import { createGameStore } from '../store/game.ts';
import { groupActions, optionLabel, ownerLine, sharedReason } from '../ui/panels/ActionSheet.tsx';
import { modeKeys } from '../ui/panels/TravelDialog.tsx';
import { feedLine, slotValues, targetInfo, targetLabel } from './copy.ts';
import { content, engine } from './engine.ts';

/** A value the test needs, or a clear failure. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

function state() {
  const store = createGameStore();
  store.getState().start('s', {
    seed: 'copy',
    players: [
      { name: 'Ana', controller: 'human' },
      { name: 'Jones', controller: 'ai' },
    ],
  });
  return must(store.getState().session, 'session').state;
}

describe('copy (NFR-06)', () => {
  it('fills slots: ids become their copy, money is formatted, players are named', () => {
    const s = state();
    expect(slotValues(s, { job: 'picker', rent: 15000, rival: 'p2', hours: 3 })).toEqual({
      job: 'Picker',
      rent: '$150',
      rival: 'Jones',
      hours: 3,
    });
  });

  it('picks a numbered feed variant and fills it', () => {
    const line = feedLine(state(), 'hired', { job: 'picker' }, 7);
    expect(line).toContain('Picker');
    expect(line).not.toContain('{{');
  });

  it('labels targets by the action kind', () => {
    expect(targetLabel('apply-job', 'picker')).toBe('Picker');
    expect(targetLabel('deposit', 'savings')).toBe('Savings');
    expect(targetInfo('apply-job', 'picker', state().world)).toContain('$18/h');
  });

  it('gives every action that can be taken a unique shortcut, local actions first', () => {
    const s = state();
    const groups = groupActions(engine.listActions(s), (n) => `k${n}`);
    const rows = groups.flatMap((g) => g.rows);
    const keys = rows.flatMap((r) => (r.key ? [r.key] : []));
    expect(new Set(keys).size).toBe(keys.length);
    // Only rows that can be taken get a shortcut.
    for (const r of rows) expect(r.key !== undefined).toBe(r.preview.available);
    expect(groups.findIndex((g) => g.anywhere)).toBeGreaterThan(0);
    const work = groups.find((g) => g.actionId === 'wfh');
    expect(work?.rows.map((r) => optionLabel(r.preview.action))).toEqual(['2h', '4h', '8h']);
    // Without a remote job every row is blocked for the same reason, so the group shows as one line.
    expect(sharedReason(must(work, 'wfh group'))).toBe('NO_JOB');
    expect(
      groups.filter((g) => g.rows.some((r) => r.preview.available)).map(sharedReason),
    ).not.toContain('NO_JOB');
  });

  it('has an owner line for every location and week', () => {
    for (const { id } of content.city.board.locations)
      for (let week = 1; week <= 6; week++) expect(i18n.exists(ownerLine(id, week))).toBe(true);
  });

  it('gives each transport mode its own letter', () => {
    expect(modeKeys(['walk', 'transit', 'rideshare', 'e-scooter'])).toEqual({
      walk: 'w',
      transit: 't',
      rideshare: 'r',
      'e-scooter': 'e',
    });
    expect(modeKeys(['taxi', 'tram'])).toEqual({ taxi: 't', tram: 'r' });
  });
});
