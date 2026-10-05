import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  balance,
  CitySchema,
  checkContent,
  checkStrings,
  defaultCity,
  defaultContent,
  en,
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
    expect(BalanceSchema.safeParse({ ...balance, wardrobeTiers: ['casual'] }).success).toBe(false);
  });

  it('rejects minutes that are not quarter-hours, fractional cents and bad effect ranges', () => {
    const action = {
      id: 'x',
      location: 'your-place',
      kind: 'basic',
      minutes: 60,
      cost: 0,
      effects: {},
    };
    expect(LocationActionSchema.safeParse(action).success).toBe(true);
    expect(LocationActionSchema.safeParse({ ...action, minutes: 10 }).success).toBe(false);
    expect(LocationActionSchema.safeParse({ ...action, minutes: 0 }).success).toBe(false);
    expect(LocationActionSchema.safeParse({ ...action, cost: 9.5 }).success).toBe(false);
    expect(LocationActionSchema.safeParse({ ...action, kind: 'teleport' }).success).toBe(false);
    const inverted = { ...action, effects: { social: { min: 5, max: 1 } } };
    expect(LocationActionSchema.safeParse(inverted).success).toBe(false);
    expect(LocationActionSchema.safeParse({ ...action, id: 'Not Kebab' }).success).toBe(false);
  });

  it('has English copy for every id the content uses (NFR-06)', () => {
    expect(checkStrings(defaultContent, en)).toEqual([]);
    const { 'action.nap': _, ...rest } = en;
    expect(checkStrings(defaultContent, rest)).toEqual(['missing string "action.nap"']);
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
    const short = { ...defaultCity.board, segments: [1] };
    expect(checkContent(withCity({ board: short }))).toEqual([
      'the board needs one segment per location',
    ]);
    const onlyItems = defaultCity.board.transportModes.map((m) => ({ ...m, requiresItem: 'car' }));
    expect(
      checkContent(withCity({ board: { ...defaultCity.board, transportModes: onlyItems } })),
    ).toEqual(['at least one transport mode must need no item']);
  });

  it('parses the city through its schema', () => {
    expect(CitySchema.safeParse(defaultCity).success).toBe(true);
  });
});
