/** Phase 5 sim tooling (simulator §4–§8): traces, luck share, choice classes, sweeps, scenarios and the HTML report. */
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { assessGame, classify, regretByPersona, type Situation } from './assess/assess.ts';
import { htmlReport } from './runner/html.ts';
import { computeKpis, luckShare } from './runner/kpis.ts';
import { type GameRecord, type Matchup, playRecorded, playTraced } from './runner/record.ts';
import type { Report } from './runner/report.ts';
import { patchAt } from './runner/sweep.ts';
import { decodeTrace, describeAction, encodeTrace, formatTrace } from './runner/trace.ts';
import { applyScenario } from './scenario.ts';

const engine = createEngine(defaultContent);
const matchup: Matchup = {
  id: 'balanced-standard',
  bots: ['balanced'],
  jones: 'standard',
  difficulty: 'standard',
  weekLimit: 6,
};

describe('decision traces (simulator §4)', () => {
  it('traces the same game it records: explaining a move never changes it', () => {
    const plain = playRecorded(engine, matchup, 'trace-1');
    const { record, trace } = playTraced(engine, matchup, 'trace-1');
    expect({ ...record, ms: 0 }).toEqual({ ...plain, ms: 0 });
    expect(trace.length).toBe(record.actions);
    expect(trace[0]?.options.length).toBeGreaterThan(0);
    // The log of chosen actions replays the game.
    const replayed = engine.replay(
      {
        seed: 'trace-1',
        players: [
          { name: 'balanced-1', controller: 'human' },
          { name: 'Jones', controller: 'ai' },
        ],
        config: { weekLimit: 6, difficulty: 'standard' },
      },
      trace.map((t) => t.chosen),
    );
    expect(replayed.phase.kind).toBe('gameOver');
  });

  it('round-trips through gzipped JSONL and reads as a week-by-week log', () => {
    const { record, trace } = playTraced(engine, matchup, 'trace-2');
    const decoded = decodeTrace(encodeTrace(record, trace));
    expect(decoded.record).toEqual(record);
    expect(decoded.trace).toEqual(trace);
    const text = formatTrace(record, trace);
    expect(text).toContain('— Week 1 —');
    expect(text).toMatch(/W1 balanced \[Your Place/);
  });

  it('names actions in plain words', () => {
    expect(describeAction({ type: 'travel', to: 'joblink', mode: 'transit' })).toBe(
      'Transit to JobLink Hub',
    );
    expect(describeAction({ type: 'endWeek' })).toBe('End week');
  });

  it('records the first goal milestone week and no anomalies for a sensible game', () => {
    const r = playRecorded(engine, matchup, 'trace-3');
    expect(r.firstMilestone[0]).not.toBeNull();
    expect(r.anomalies).toEqual([]);
    expect(r.netWorthByWeek[0]?.length).toBe(r.endWeek);
  });
});

const rec = (matchup: string, bot: string, score: number): GameRecord =>
  ({
    matchup,
    seats: [bot, 'jones'],
    scoresBp: [score, 9000],
    winner: 'p2',
    winnerBy: 'jones',
    anomalies: [],
  }) as unknown as GameRecord;

describe('luck share (simulator §5)', () => {
  it('is low when personas differ and seeds barely matter', () => {
    const groups = new Map([
      ['a-standard', [rec('a-standard', 'a', 9000), rec('a-standard', 'a', 9100)]],
      ['b-standard', [rec('b-standard', 'b', 3000), rec('b-standard', 'b', 3100)]],
    ]);
    expect(luckShare(groups)).toBeLessThan(100);
  });

  it('is high when seeds swing scores and personas look alike', () => {
    const groups = new Map([
      ['a-standard', [rec('a-standard', 'a', 2000), rec('a-standard', 'a', 9000)]],
      ['b-standard', [rec('b-standard', 'b', 2100), rec('b-standard', 'b', 9100)]],
    ]);
    expect(luckShare(groups)).toBeGreaterThan(9000);
  });

  it('ignores floor bots and appears in the KPIs', () => {
    const records = [
      rec('a-standard', 'a', 9000),
      rec('a-standard', 'a', 8000),
      rec('b-standard', 'b', 5000),
      rec('b-standard', 'b', 4000),
      rec('idle-standard', 'idle', 0),
      rec('idle-standard', 'idle', 0),
    ].map((r) => ({ ...r, events: [], choices: [], news: [], jobs: [], items: [], quests: [] }));
    const kpis = computeKpis(defaultContent, records as GameRecord[], 1);
    expect(kpis.luckShare).toBeGreaterThan(0);
    expect(kpis.luckShare).toBeLessThan(5000);
  });
});

const situation = (patch: Partial<Situation>): Situation => ({
  event: 'e',
  persona: 'balanced',
  matchup: 'balanced-standard',
  seed: 's',
  week: 3,
  values: { a: 5000, b: 4000 },
  chosen: 'a',
  best: 'a',
  regret: 0,
  ...patch,
});

describe('choice classes (simulator §6)', () => {
  const events = new Map([['e', ['a', 'b']]]);
  const both = new Set(['e.a', 'e.b']);

  it('calls an option that always wins, for every persona, a no-brainer', () => {
    const s = ['balanced', 'saver', 'careerist'].map((persona) => situation({ persona }));
    const [v] = classify(events, s, both);
    expect(v).toMatchObject({ class: 'no-brainer', about: ['a'] });
  });

  it('calls an often-picked option with high regret a trap', () => {
    const s = [
      situation({ best: 'b', chosen: 'a', values: { a: 4000, b: 5000 }, regret: 1000 }),
      situation({
        best: 'b',
        chosen: 'a',
        values: { a: 4000, b: 5000 },
        regret: 1000,
        persona: 'saver',
      }),
      situation({ best: 'a', chosen: 'a', values: { a: 5000, b: 4000 }, persona: 'saver' }),
      situation({
        best: 'a',
        chosen: 'b',
        values: { a: 5000, b: 4000 },
        regret: 1000,
        persona: 'careerist',
      }),
    ];
    const [v] = classify(events, s, both);
    expect(v?.class).toBe('trap');
  });

  it('calls options within noise flat, and never-picked ones dead', () => {
    const flat = [1, 2, 3].map(() => situation({ values: { a: 5000, b: 4990 } }));
    expect(classify(events, flat, both)[0]?.class).toBe('flat');
    expect(classify(events, flat, new Set(['e.a']))[0]).toMatchObject({
      class: 'dead',
      about: ['b'],
    });
  });

  it('assesses a real game with common random numbers and reports regret per bot', () => {
    const { situations, picked } = assessGame(engine, { ...matchup, weekLimit: 8 }, 'assess-1', {
      rateBp: 10_000,
      rollouts: 2,
      horizonWeeks: 2,
    });
    expect(situations.length).toBeGreaterThan(0);
    expect(picked.length).toBeGreaterThan(0);
    for (const s of situations) expect(s.regret).toBeGreaterThanOrEqual(0);
    expect(regretByPersona(situations).balanced).toBeGreaterThanOrEqual(0);
  });
});

describe('sweeps and scenarios (simulator §7)', () => {
  it('turns a parameter path into an override patch, addressing arrays by id', () => {
    expect(patchAt('content.balance.aiDisruption.baseRateBp', 300)).toEqual({
      balance: { aiDisruption: { baseRateBp: 300 } },
    });
    expect(patchAt('city.housing[studio].rent', 30000)).toEqual({
      city: { housing: [{ id: 'studio', rent: 30000 }] },
    });
  });

  it('starts human seats from the scenario and leaves Jones alone', () => {
    const { state } = engine.newGame({
      seed: 'scn',
      players: [
        { name: 'Me', controller: 'human' },
        { name: 'Jones', controller: 'ai' },
      ],
    });
    applyScenario(state, {
      id: 't',
      note: '',
      player: {
        stats: { cash: 0 },
        debts: { card: { balance: 1000, missed: 1, collections: false } },
      },
    });
    expect(state.players[0]?.stats.cash).toBe(0);
    expect(state.players[0]?.stats.energy).toBe(defaultContent.balance.startingStats.energy);
    expect(state.players[0]?.debts.card.balance).toBe(1000);
    expect(state.players[1]?.stats.cash).toBe(defaultContent.balance.startingStats.cash);
  });
});

describe('HTML report (simulator §8)', () => {
  it('is one self-contained page with charts', () => {
    const records = [1, 2, 3].map((i) => playRecorded(engine, matchup, `html-${i}`));
    const kpis = computeKpis(defaultContent, records, 1);
    const report: Report = {
      meta: {
        engineVersion: 'x',
        contentVersion: 1,
        contentHash: 'abc',
        seed: 's',
        plan: 'ci',
        games: 3,
        workers: 1,
        seconds: 1,
        override: null,
        commit: null,
      },
      kpis,
      bands: [],
      unused: { jobs: ['x<y'] },
      records,
    };
    const html = htmlReport(report, null);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<svg');
    expect(html).toContain('x&lt;y');
    expect(html).not.toMatch(/<script|https?:\/\//);
  });
});
