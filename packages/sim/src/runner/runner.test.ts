/** The balance runner (simulator §2, §5, §7): plans, records, KPIs, bands, compare and the worker pool. */
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { checkBands, computeKpis } from './kpis.ts';
import { CI_PLAN, jobsFor } from './plan.ts';
import { runPool } from './pool.ts';
import { type GameRecord, type Matchup, playRecorded } from './record.ts';
import { compareReports, type Report, summaryMarkdown } from './report.ts';

const engine = createEngine(defaultContent);
const vsJones: Matchup = {
  id: 'balanced-standard',
  bots: ['balanced'],
  jones: 'standard',
  difficulty: 'standard',
  weekLimit: 12,
};

const record = (patch: Partial<GameRecord>): GameRecord => ({
  matchup: 'balanced-standard',
  seed: 's',
  seats: ['balanced', 'jones'],
  winner: 'p1',
  winnerBy: 'balanced',
  reason: 'win',
  endWeek: 30,
  scoresBp: [10_000, 9000],
  setbacks: [
    { evictions: 0, collections: 0, burnouts: 0, layoffs: 0 },
    { evictions: 0, collections: 0, burnouts: 0, layoffs: 0 },
  ],
  firstPaycheck: [1, 1],
  events: [],
  choices: [],
  news: [],
  jobs: [],
  items: [],
  quests: [],
  actions: 100,
  ms: 10,
  ...patch,
});

describe('balance runner', () => {
  it('shares games out by weight, seeding game i of every matchup the same', () => {
    const jobs = jobsFor(CI_PLAN, 100, 'x');
    expect(new Set(jobs.map((j) => j.matchup.id)).size).toBe(CI_PLAN.length);
    expect(jobs.filter((j) => j.matchup.id === 'balanced-standard').length).toBeGreaterThan(
      jobs.filter((j) => j.matchup.id === 'idle-standard').length,
    );
    expect(jobs.find((j) => j.matchup.id === 'idle-standard')?.seed).toBe('x-0');
  });

  it('records a game against Jones, with setbacks, first paycheck and content used', () => {
    const r = playRecorded(engine, vsJones, 'rec-1');
    expect(r.seats).toEqual(['balanced', 'jones']);
    expect(r.endWeek).toBeLessThanOrEqual(12);
    expect(r.firstPaycheck[0]).not.toBeNull();
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.scoresBp).toHaveLength(2);
  });

  it('gives the same records however the games are split across workers (SIM-03)', async () => {
    const jobs = [0, 1, 2, 3].map((i) => ({ matchup: vsJones, seed: `pool-${i}` }));
    const strip = (rs: GameRecord[]) => rs.map(({ ms: _ms, ...rest }) => rest);
    const one = await runPool(jobs, { workers: 1 });
    const two = await runPool(jobs, { workers: 2 });
    expect(strip(two)).toEqual(strip(one));
  });

  it('computes KPIs and checks them against hard and soft bands (simulator §5)', () => {
    const records = [
      record({ seed: 'a' }),
      record({ seed: 'b', winner: 'p2', winnerBy: 'jones', endWeek: 40 }),
    ];
    const kpis = computeKpis(defaultContent, records, 1);
    expect(kpis['win.balanced-standard']).toBe(5000);
    expect(kpis['jonesWin.balanced-standard']).toBe(5000);
    expect(kpis['winWeek.balanced-standard']).toBe(30);
    const bands = checkBands(kpis, [
      { kpi: 'win.balanced-standard', hard: { min: 4000 }, soft: { min: 6000 }, note: '' },
      { kpi: 'jonesWin.balanced-standard', hard: { max: 4000 }, note: '' },
      { kpi: 'missing.kpi', hard: {}, note: '' },
    ]);
    expect(bands.map((b) => b.status)).toEqual(['soft', 'hard', 'missing']);
  });

  it('compares two runs game by game on the same seeds (simulator §7)', () => {
    const base: Report = {
      meta: {
        engineVersion: 'x',
        contentVersion: 1,
        contentHash: 'abc',
        seed: 's',
        plan: 'ci',
        games: 2,
        workers: 1,
        seconds: 1,
        override: null,
        commit: null,
      },
      kpis: { 'win.balanced-standard': 0 },
      bands: [],
      unused: {},
      records: [record({ seed: 'a', winner: 'p2' }), record({ seed: 'b', winner: 'p2' })],
    };
    const head: Report = {
      ...base,
      kpis: { 'win.balanced-standard': 10_000 },
      records: [record({ seed: 'a' }), record({ seed: 'b' })],
    };
    const [delta] = compareReports(base, head);
    expect(delta).toMatchObject({ kpi: 'win.balanced-standard', base: 0, head: 10_000 });
    expect(delta?.paired).toEqual({ mean: 10_000, half: 0, games: 2 });
    expect(summaryMarkdown(head, [delta ?? { kpi: '', base: 0, head: 0 }])).toContain(
      'Compared with the base run',
    );
  });
});
