import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  balance,
  CitySchema,
  checkContent,
  defaultCity,
  defaultContent,
  type GameContent,
  LocationActionSchema,
  MetaSchema,
  meta,
} from './index.ts';

const withCity = (patch: Partial<GameContent['city']>): GameContent => ({
  ...defaultContent,
  city: { ...defaultCity, ...patch },
});

describe('content', () => {
  it('ships a valid manifest, balance and default city', () => {
    expect(meta.contentVersion).toBeGreaterThan(0);
    expect(defaultCity.id).toBe(meta.defaultCity);
    expect(checkContent(defaultContent)).toEqual([]);
  });

  it('ships every MVP board location (§16)', () => {
    expect(defaultCity.board.locations.map((l) => l.id)).toEqual([
      'your-place',
      'leaselord',
      'joblink',
      'upskill-u',
      'fulfillment',
      'burger-bot',
      'freshmart',
      'thriftup',
      'circuit-planet',
      'neobank',
    ]);
  });

  it('rejects an invalid manifest', () => {
    expect(MetaSchema.safeParse({ contentVersion: 0, defaultCity: '' }).success).toBe(false);
  });

  it('rejects starting stats outside their range and a mismatched wardrobe range', () => {
    const bad = { ...balance, startingStats: { ...balance.startingStats, energy: 101 } };
    expect(BalanceSchema.safeParse(bad).success).toBe(false);
    expect(BalanceSchema.safeParse({ ...balance, wardrobeTiers: ['Casual'] }).success).toBe(false);
  });

  it('rejects hours that are not quarter-hours and bad effect ranges', () => {
    const action = { id: 'x', location: 'your-place', name: 'X', hours: 1, cost: 0, effects: {} };
    expect(LocationActionSchema.safeParse(action).success).toBe(true);
    expect(LocationActionSchema.safeParse({ ...action, hours: 0.1 }).success).toBe(false);
    expect(LocationActionSchema.safeParse({ ...action, hours: 0 }).success).toBe(false);
    const inverted = { ...action, effects: { social: { min: 5, max: 1 } } };
    expect(LocationActionSchema.safeParse(inverted).success).toBe(false);
    expect(LocationActionSchema.safeParse({ ...action, id: 'Not Kebab' }).success).toBe(false);
  });

  it('finds broken cross-references', () => {
    const [first] = defaultCity.actions;
    if (!first) throw new Error('no actions');
    expect(checkContent(withCity({ actions: [{ ...first, location: 'atlantis' }] }))).toEqual([
      `action "${first.id}" is at unknown location "atlantis"`,
    ]);
    expect(checkContent(withCity({ actions: [first, first] }))).toEqual([
      `duplicate action id "${first.id}"`,
    ]);
    const board = { ...defaultCity.board, home: 'atlantis' };
    expect(checkContent(withCity({ board }))).toEqual(['home "atlantis" is not a location']);
    const onlyItems = defaultCity.board.transportModes.map((m) => ({ ...m, requiresItem: 'car' }));
    expect(
      checkContent(withCity({ board: { ...defaultCity.board, transportModes: onlyItems } })),
    ).toEqual(['at least one transport mode must need no item']);
  });

  it('parses the city through its schema', () => {
    expect(CitySchema.safeParse(defaultCity).success).toBe(true);
  });
});
