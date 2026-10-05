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

  it('rejects returns that lose more than everything and trips that take no time', () => {
    const regimes = balance.market.regimes.map((r) => ({
      ...r,
      returnsBp: { ...r.returnsBp, 'index-fund': { min: -12_000, max: -11_000 } },
    }));
    const market = { ...balance.market, regimes };
    expect(BalanceSchema.safeParse({ ...balance, market }).success).toBe(false);
    const [mode] = defaultCity.board.transportModes;
    if (!mode) throw new Error('no modes');
    const instant = { ...mode, minutesBase: 0, minutesPerStep: 0 };
    const board = { ...defaultCity.board, transportModes: [instant] };
    expect(CitySchema.safeParse({ ...defaultCity, board }).success).toBe(false);
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
    // A cash effect is earnings; a negative one would let an affordable action take cash below 0.
    expect(LocationActionSchema.safeParse({ ...action, effects: { cash: -500 } }).success).toBe(
      false,
    );
    const loss = { ...action, effects: { cash: { min: -100, max: 100 } } };
    expect(LocationActionSchema.safeParse(loss).success).toBe(false);
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
    const [first, ...rest] = defaultCity.actions;
    if (!first) throw new Error('no actions');
    expect(
      checkContent(withCity({ actions: [{ ...first, location: 'atlantis' }, ...rest] })),
    ).toEqual([`action "${first.id}" is at unknown location "atlantis"`]);
    expect(checkContent(withCity({ actions: [first, first, ...rest] }))).toEqual([
      `duplicate action id "${first.id}"`,
    ]);
    const board = { ...defaultCity.board, home: 'atlantis' };
    expect(checkContent(withCity({ board }))).toEqual(['home "atlantis" is not a location']);
    const short = { ...defaultCity.board, segments: [1] };
    expect(checkContent(withCity({ board: short }))).toEqual([
      'the board needs one segment per location',
    ]);
    const onlyItems = defaultCity.board.transportModes.map((m) => ({
      ...m,
      requiresItem: 'laptop',
    }));
    expect(
      checkContent(withCity({ board: { ...defaultCity.board, transportModes: onlyItems } })),
    ).toEqual(['at least one transport mode must need no item']);
  });

  it('ships the MVP jobs and items (§16: ~20 jobs, ~15 items)', () => {
    expect(defaultCity.jobs.length).toBeGreaterThanOrEqual(20);
    const durables = defaultCity.items.filter((i) => i.meals === undefined);
    expect(durables.length).toBeGreaterThanOrEqual(15);
    // Every MVP shop sells something (Phase 2: FreshMart, ThriftUp, Circuit Planet, Burger Bot).
    for (const shop of ['freshmart', 'thriftup', 'circuit-planet', 'burger-bot'])
      expect(defaultCity.items.some((i) => i.shop === shop)).toBe(true);
    // Five housing tiers, the first free (FR-51, FR-14).
    expect(defaultCity.housing.map((h) => h.rent)[0]).toBe(0);
    expect(defaultCity.housing).toHaveLength(5);
  });

  it('finds broken job, item, course and market references', () => {
    const [job] = defaultCity.jobs;
    if (!job) throw new Error('no jobs');
    const badJob = {
      ...job,
      id: 'ghost',
      ladder: 'ghost',
      requires: { credentials: ['nope'], skills: {} },
    };
    expect(checkContent(withCity({ jobs: [...defaultCity.jobs, badJob] }))).toEqual([
      'job "ghost" needs unknown credential "nope"',
    ]);
    const gappy = { ...job, id: 'skipper', ladder: 'gap', level: 2 };
    expect(checkContent(withCity({ jobs: [...defaultCity.jobs, gappy] }))).toEqual([
      'ladder "gap" needs one job per level, starting at 1',
    ]);
    const noEntry = defaultCity.jobs.map((j) => ({ ...j, openChanceBp: 5000 }));
    expect(checkContent(withCity({ jobs: noEntry }))).toContain(
      'at least one job must need nothing and always be open (FR-14)',
    );
    // An entry job is only a floor if it can be worked (FR-14).
    const moved = defaultCity.jobs.map((j) =>
      j.id === 'picker' ? { ...j, location: 'thriftup' } : j,
    );
    expect(checkContent(withCity({ jobs: moved }))).toEqual([
      'job "picker" has no work-shift action at its location',
    ]);
    const [home] = defaultCity.housing;
    if (!home) throw new Error('no housing');
    expect(
      checkContent(
        withCity({ housing: [{ ...home, rent: 100 }, ...defaultCity.housing.slice(1)] }),
      ),
    ).toEqual([`the first housing tier "${home.id}" must be free (FR-14)`]);
    const orphan = {
      ...defaultCity.items[0],
      id: 'orphan',
      requiresItem: 'unicorn',
    } as (typeof defaultCity.items)[number];
    expect(checkContent(withCity({ items: [...defaultCity.items, orphan] }))).toEqual([
      'item "orphan" needs unknown item "unicorn"',
    ]);
  });

  it('parses the city through its schema', () => {
    expect(CitySchema.safeParse(defaultCity).success).toBe(true);
  });
});
