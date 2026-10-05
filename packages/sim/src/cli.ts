/**
 * Headless simulator (simulator.md).
 *
 *   pnpm sim [random] [--games 20] [--weeks 52] [--players 2] [--seed fastlane]
 *     Random legal games, each replayed to the same state hash (the Phase 1 check). Player 1 is a random human;
 *     the rest are engine-played AI.
 *
 *   pnpm sim bots --bots balanced,careerist [--difficulty standard] [--override overrides/rent-plus-10.json]
 *     Each bot plays solo games; prints wins, weeks and score. Bots are persona ids, or random, idle, sensible, gigger.
 *
 *   pnpm sim run [--games 1000] [--seed fastlane] [--workers N] [--override …] [--out sim-out/<seed>]
 *                [--base <report.json>]
 *     The balance run (simulator §5, CI-04): every matchup in the CI plan across a worker pool, KPIs checked against
 *     `@fastlane/content/sim` bands. Writes report.json and summary.md; exits 1 when a hard band fails.
 *
 *   pnpm sim compare --base <report.json | git ref> --head <report.json>
 *     Paired comparison on the same seeds (simulator §7). A git ref is run in a temporary worktree first.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DIFFICULTIES, type Difficulty, defaultContent, type GameContent } from '@fastlane/content';
import { kpiBands } from '@fastlane/content/sim';
import { createEngine, ENGINE_VERSION } from '@fastlane/engine';
import { playGame } from './game.ts';
import { loadOverride } from './override.ts';
import { randomPlay } from './random-play.ts';
import { checkBands, computeKpis, unusedContent } from './runner/kpis.ts';
import { CI_PLAN, jobsFor } from './runner/plan.ts';
import { runPool } from './runner/pool.ts';
import { botFor } from './runner/record.ts';
import { compareReports, type Report, summaryMarkdown } from './runner/report.ts';

const COMMANDS = ['random', 'bots', 'run', 'compare'] as const;
type Command = (typeof COMMANDS)[number];

const { values, positionals } = parseArgs({
  // pnpm forwards a literal `--` before script arguments.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  allowPositionals: true,
  options: {
    games: { type: 'string' },
    weeks: { type: 'string', default: '52' },
    players: { type: 'string', default: '2' },
    seed: { type: 'string', default: 'fastlane' },
    bots: { type: 'string' },
    difficulty: { type: 'string', default: 'standard' },
    override: { type: 'string' },
    workers: { type: 'string' },
    out: { type: 'string' },
    base: { type: 'string' },
    head: { type: 'string' },
  },
});
const command: Command = COMMANDS.includes(positionals[0] as Command)
  ? (positionals[0] as Command)
  : values.bots
    ? 'bots'
    : 'random';
/** Paths are relative to where the command was started: pnpm runs scripts from the package folder. */
const fromCwd = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const content: GameContent = values.override
  ? loadOverride(defaultContent, fromCwd(values.override))
  : defaultContent;

console.log(
  `fastlane-sim ${command} — engine ${ENGINE_VERSION}, content v${content.meta.contentVersion}` +
    (values.override ? ` + ${values.override}` : ''),
);
const handlers: Record<Command, () => Promise<number> | number> = {
  random: runRandomPlay,
  bots: () => runBots((values.bots ?? 'balanced').split(',')),
  run: runBalance,
  compare: runCompare,
};
process.exit(await handlers[command]());

function runRandomPlay(): number {
  const games = Number(values.games ?? 20);
  const weeks = Number(values.weeks);
  const players = Number(values.players);
  console.log(`${games} games × ${weeks} weeks × ${players} players of random legal actions`);
  let mismatches = 0;
  let totalActions = 0;
  for (let g = 0; g < games; g++) {
    const setup = {
      seed: `${values.seed}-${g}`,
      players: Array.from({ length: players }, (_, i) => ({
        name: `P${i + 1}`,
        controller: i === 0 ? ('human' as const) : ('ai' as const),
      })),
      config: { weekLimit: weeks },
    };
    const started = performance.now();
    const result = randomPlay(content, setup, `chooser-${g}`);
    const ms = performance.now() - started;
    totalActions += result.log.length;
    const ok = result.hash === result.replayHash;
    if (!ok) mismatches++;
    const cash = result.state.players.map((p) => p.stats.cash).join('/');
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${setup.seed}: week ${result.state.week}, ` +
        `${result.log.length} human actions, cash ${cash}, ${ms.toFixed(0)} ms (incl. replay), ` +
        `hash ${result.hash}`,
    );
  }
  console.log(`${totalActions} human actions, ${mismatches} replay mismatches`);
  return mismatches === 0 ? 0 : 1;
}

function runBots(ids: string[]): number {
  const games = Number(values.games ?? 20);
  const weeks = Number(values.weeks);
  const difficulty = values.difficulty as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) throw new Error(`unknown difficulty ${difficulty}`);
  console.log(`${games} solo games × ${weeks} weeks per bot, ${difficulty}`);
  const engine = createEngine(content);
  console.log('bot        wins   median win week   mean score   ms/game');
  for (const id of ids) {
    const winWeeks: number[] = [];
    let scoreTotal = 0;
    const started = performance.now();
    for (let g = 0; g < games; g++) {
      const seed = `${values.seed}-${g}`;
      const setup = {
        seed,
        players: [{ name: id, controller: 'human' as const }],
        config: { weekLimit: weeks, difficulty },
      };
      const { state } = playGame(engine, setup, [botFor(content, id, seed)]);
      if (state.phase.kind !== 'gameOver') throw new Error('game did not end');
      const { result } = state.phase;
      if (result.reason === 'win') winWeeks.push(result.week);
      scoreTotal += result.scores.p1 ?? 0;
    }
    const ms = (performance.now() - started) / games;
    winWeeks.sort((a, b) => a - b);
    const median = winWeeks.length ? String(winWeeks[Math.floor(winWeeks.length / 2)]) : '—';
    console.log(
      `${id.padEnd(10)} ${`${winWeeks.length}/${games}`.padStart(5)}   ${median.padStart(15)}   ` +
        `${(scoreTotal / games / 100).toFixed(1).padStart(9)}%   ${ms.toFixed(0).padStart(7)}`,
    );
  }
  return 0;
}

function gitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function runBalance(): Promise<number> {
  const games = Number(values.games ?? 1000);
  const seed = values.seed;
  const jobs = jobsFor(CI_PLAN, games, seed);
  const workers = values.workers ? Number(values.workers) : undefined;
  console.log(`${jobs.length} games across ${CI_PLAN.length} matchups`);
  const started = performance.now();
  let last = 0;
  const records = await runPool(jobs, {
    ...(workers === undefined ? {} : { workers }),
    override: values.override ? fromCwd(values.override) : null,
    onRecord(done) {
      const pct = Math.floor((done * 10) / jobs.length);
      if (pct > last) {
        last = pct;
        console.log(`  ${done}/${jobs.length} games`);
      }
    },
  });
  const seconds = (performance.now() - started) / 1000;
  const kpis = computeKpis(content, records, seconds);
  const report: Report = {
    meta: {
      engineVersion: ENGINE_VERSION,
      contentVersion: content.meta.contentVersion,
      contentHash: createEngine(content).contentHash,
      seed,
      plan: 'ci',
      games: records.length,
      workers: workers ?? (await import('node:os')).availableParallelism(),
      seconds,
      override: values.override ?? null,
      commit: gitCommit(),
    },
    kpis,
    bands: checkBands(kpis, kpiBands),
    unused: unusedContent(content, records),
    records,
  };
  const out = fromCwd(values.out ?? join('sim-out', seed));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.json'), JSON.stringify(report));
  const base = values.base ? loadReport(fromCwd(values.base)) : null;
  const summary = summaryMarkdown(report, base ? compareReports(base, report) : null);
  writeFileSync(join(out, 'summary.md'), summary);
  console.log(`\n${summary}\nwrote ${out}`);
  const failed = report.bands.filter((b) => b.status === 'hard' || b.status === 'missing');
  for (const b of failed)
    console.error(`FAIL ${b.kpi} = ${b.value} (hard band ${JSON.stringify(b.band.hard)})`);
  return failed.length > 0 ? 1 : 0;
}

function loadReport(path: string): Report {
  return JSON.parse(readFileSync(path, 'utf8')) as Report;
}

/** Run the balance sim at a git ref in a temporary worktree, so `compare` can take a ref as its base. */
function reportAtRef(ref: string): Report {
  const dir = mkdtempSync(join(tmpdir(), 'fastlane-sim-'));
  const run = (cmd: string, args: string[], cwd?: string) =>
    execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  try {
    run('git', ['worktree', 'add', '--detach', dir, ref]);
    run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], dir);
    const args = ['--filter', '@fastlane/sim', 'sim', 'run', '--out', join(dir, 'sim-out')];
    if (values.games) args.push('--games', values.games);
    args.push('--seed', values.seed);
    try {
      run('pnpm', args, dir);
    } catch {
      // Hard bands may fail at the base; the report is still written.
    }
    return loadReport(join(dir, 'sim-out', 'report.json'));
  } finally {
    run('git', ['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCompare(): number {
  if (!values.base || !values.head) throw new Error('compare needs --base and --head');
  const base = values.base.endsWith('.json')
    ? loadReport(fromCwd(values.base))
    : reportAtRef(values.base);
  const head = loadReport(fromCwd(values.head));
  console.log(summaryMarkdown(head, compareReports(base, head)));
  return 0;
}
