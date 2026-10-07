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
 *
 *   pnpm sim assess [--games 500] [--rollouts 8] [--horizon 8] [--assess-rate 0.25] [--override …]
 *     Choice assessment (simulator §6): counterfactual rollouts on sampled weekend decisions, a verdict per event
 *     (meaningful, no-brainer, trap, flat, dead) and each bot's mean regret. Writes assess.json and assess.md.
 *
 *   pnpm sim sweep --param balance.aiDisruption.baseRateBp --from 100 --to 400 [--steps 5] [--games 500]
 *     One value across a range (simulator §7): a balance run per step on the same seeds, KPIs and bands per value.
 *     Paths address arrays of objects by id: `city.housing[studio].rent`.
 *
 *   `run`, `assess` and `trace` take `--scenario scenarios/<id>.json` to start every game from a set position;
 *   `run` and `sweep` take `--matchups a,b` to play only some of the CI plan.
 *
 *   pnpm sim trace <seed> [--matchup balanced-standard] [--file traces/<game>.jsonl.gz] [--replay game.json]
 *     A readable week-by-week log of one game (simulator §4), replayed from its seed or read from a trace file.
 *     `--replay` also writes `{ setup, log }` for the client's debug replay route (`#/replay`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DIFFICULTIES, type Difficulty, defaultContent, type GameContent } from '@fastlane/content';
import { kpiBands } from '@fastlane/content/sim';
import { createEngine, ENGINE_VERSION } from '@fastlane/engine';
import { type AssessOptions, classify, regretByPersona, type Situation } from './assess/assess.ts';
import { type AssessReport, assessMarkdown } from './assess/report.ts';
import type { AssessJob } from './assess/worker.ts';
import { playGame } from './game.ts';
import { loadOverride, merge } from './override.ts';
import { randomPlay } from './random-play.ts';
import { htmlReport } from './runner/html.ts';
import { checkBands, computeKpis, unusedContent } from './runner/kpis.ts';
import { ASSESS_PLAN, CI_PLAN, jobsFor, type MatchupPlan } from './runner/plan.ts';
import { runPool, runWorkers } from './runner/pool.ts';
import { botFor, playTraced, setupFor } from './runner/record.ts';
import { compareReports, incomparable, type Report, summaryMarkdown } from './runner/report.ts';
import { patchAt, sweepMarkdown } from './runner/sweep.ts';
import { decodeTrace, encodeTrace, formatTrace, traceFileName } from './runner/trace.ts';
import { loadScenario } from './scenario.ts';

const COMMANDS = ['random', 'bots', 'run', 'compare', 'trace', 'assess', 'sweep'] as const;
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
    'trace-rate': { type: 'string', default: '0.01' },
    matchup: { type: 'string', default: 'balanced-standard' },
    file: { type: 'string' },
    replay: { type: 'string' },
    rollouts: { type: 'string', default: '8' },
    horizon: { type: 'string', default: '8' },
    'assess-rate': { type: 'string', default: '0.25' },
    scenario: { type: 'string' },
    matchups: { type: 'string' },
    param: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    steps: { type: 'string', default: '5' },
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
  trace: runTrace,
  assess: runAssess,
  sweep: runSweep,
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

/** The plan's matchups, each starting from `--scenario` when one is given (simulator §7). */
function planWithScenario(full: MatchupPlan): MatchupPlan {
  // `--matchups a,b` plays only those, for a quick look at one part of the curve; bands for the rest show as missing.
  const only = values.matchups?.split(',');
  const plan = only ? full.filter((m) => only.includes(m.matchup.id)) : full;
  if (only && plan.length === 0) throw new Error(`no matchups match ${values.matchups}`);
  if (!values.scenario) return plan;
  const start = loadScenario(fromCwd(values.scenario));
  return plan.map((m) => ({ ...m, matchup: { ...m.matchup, start } }));
}

function workerCount(jobs: number): number {
  const workers = Math.min(values.workers ? Number(values.workers) : availableParallelism(), jobs);
  if (!Number.isInteger(workers) || workers < 1)
    throw new Error(`--workers must be a positive integer, got ${values.workers}`);
  return workers;
}

/** Play the CI plan across the pool and build its report. Traces go to `traceDir` when given. */
async function balanceReport(options: {
  games: number;
  override: string | null;
  traceDir: string | null;
  quiet?: boolean;
}): Promise<Report> {
  const seed = values.seed;
  const plan = planWithScenario(CI_PLAN);
  const traceRate = options.traceDir ? Number(values['trace-rate']) : 0;
  // Sample every n-th game of each matchup, so the same games are traced in every run (simulator §4).
  const every = traceRate > 0 ? Math.max(1, Math.round(1 / traceRate)) : 0;
  const jobs = jobsFor(plan, options.games, seed).map((j) => ({
    ...j,
    trace: every > 0 && Number(j.seed.slice(seed.length + 1)) % every === 0,
  }));
  const { traceDir } = options;
  if (traceDir) {
    rmSync(traceDir, { recursive: true, force: true });
    mkdirSync(traceDir, { recursive: true });
  }
  let traced = 0;
  const workers = workerCount(jobs.length);
  if (!options.quiet) console.log(`${jobs.length} games across ${plan.length} matchups`);
  const started = performance.now();
  let last = 0;
  const records = await runPool(jobs, {
    workers,
    override: options.override,
    onTrace(record, trace) {
      if (!traceDir) return;
      traced++;
      writeFileSync(join(traceDir, traceFileName(record)), encodeTrace(record, trace));
    },
    onRecord(done) {
      const pct = Math.floor((done * 10) / jobs.length);
      if (pct > last && !options.quiet) {
        last = pct;
        console.log(`  ${done}/${jobs.length} games`);
      }
    },
  });
  if (traceDir) console.log(`${traced} games traced in ${traceDir}`);
  const seconds = (performance.now() - started) / 1000;
  const used = options.override ? loadOverride(defaultContent, options.override) : content;
  const kpis = computeKpis(used, records, seconds);
  return {
    meta: {
      engineVersion: ENGINE_VERSION,
      contentVersion: used.meta.contentVersion,
      contentHash: createEngine(used).contentHash,
      seed,
      plan: [values.matchups ?? 'ci', values.scenario].filter(Boolean).join('+'),
      games: records.length,
      workers,
      seconds,
      override: values.override ?? null,
      commit: gitCommit(),
    },
    kpis,
    bands: checkBands(kpis, kpiBands),
    unused: unusedContent(used, records),
    records,
  };
}

async function runBalance(): Promise<number> {
  const out = fromCwd(values.out ?? join('sim-out', values.seed));
  mkdirSync(out, { recursive: true });
  const report = await balanceReport({
    games: Number(values.games ?? 1000),
    override: values.override ? fromCwd(values.override) : null,
    traceDir: join(out, 'traces'),
  });
  writeFileSync(join(out, 'report.json'), JSON.stringify(report));
  const base = values.base ? loadReport(fromCwd(values.base)) : null;
  const mismatch = base && incomparable(base, report);
  if (mismatch) console.warn(`Not comparing with the base run: ${mismatch}`);
  const deltas = base && !mismatch ? compareReports(base, report) : null;
  const summary = summaryMarkdown(report, deltas);
  writeFileSync(join(out, 'summary.md'), summary);
  writeFileSync(join(out, 'report.html'), htmlReport(report, deltas));
  console.log(`\n${summary}\nwrote ${out} (open report.html in a browser)`);
  // Bands describe full runs from a normal start; a scenario or partial run is read, not gated.
  if (values.scenario || values.matchups) return 0;
  const failed = report.bands.filter((b) => b.status === 'hard' || b.status === 'missing');
  for (const b of failed)
    console.error(`FAIL ${b.kpi} = ${b.value} (hard band ${JSON.stringify(b.band.hard)})`);
  return failed.length > 0 ? 1 : 0;
}

/**
 * Sweep one balance value across a range (simulator §7): every step is a balance run on the same seeds with the
 * value patched in (on top of `--override`), and the table shows where each band holds.
 */
async function runSweep(): Promise<number> {
  const { param, from, to } = values;
  if (!param || from === undefined || to === undefined)
    throw new Error('sweep needs --param <path> --from <a> --to <b> [--steps n]');
  const steps = Math.max(2, Number(values.steps));
  const lo = Number(from);
  const hi = Number(to);
  const points = Array.from({ length: steps }, (_, i) =>
    Math.round(lo + ((hi - lo) * i) / (steps - 1)),
  );
  const base = values.override ? JSON.parse(readFileSync(fromCwd(values.override), 'utf8')) : {};
  const dir = mkdtempSync(join(tmpdir(), 'fastlane-sweep-'));
  const games = Number(values.games ?? 500);
  const reports: { value: number; report: Report }[] = [];
  try {
    for (const value of points) {
      const path = join(dir, `${value}.json`);
      writeFileSync(path, JSON.stringify(merge(base, patchAt(param, value))));
      const started = performance.now();
      const report = await balanceReport({ games, override: path, traceDir: null, quiet: true });
      console.log(`  ${param} = ${value}: ${((performance.now() - started) / 1000).toFixed(0)} s`);
      reports.push({ value, report });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const summary = sweepMarkdown(param, reports);
  const out = fromCwd(values.out ?? join('sim-out', `${values.seed}-sweep`));
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'sweep.json'),
    JSON.stringify(
      reports.map(({ value, report }) => ({ value, kpis: report.kpis, bands: report.bands })),
    ),
  );
  writeFileSync(join(out, 'sweep.md'), summary);
  console.log(`\n${summary}\nwrote ${out}`);
  return 0;
}

async function runAssess(): Promise<number> {
  const games = Number(values.games ?? 500);
  const options: AssessOptions = {
    rateBp: Math.round(Number(values['assess-rate']) * 10_000),
    rollouts: Number(values.rollouts),
    horizonWeeks: Number(values.horizon),
  };
  const jobs: AssessJob[] = jobsFor(planWithScenario(ASSESS_PLAN), games, values.seed);
  const workers = workerCount(jobs.length);
  console.log(
    `${jobs.length} games, ${options.rollouts} rollouts × ${options.horizonWeeks} weeks per option`,
  );
  const started = performance.now();
  let last = 0;
  const results = await runWorkers<AssessJob, { situations: Situation[]; picked: string[] }>(
    new URL('./assess/worker.ts', import.meta.url),
    jobs,
    {
      workers,
      workerData: { override: values.override ? fromCwd(values.override) : null, options },
      onResult(_r, done) {
        const pct = Math.floor((done * 10) / jobs.length);
        if (pct > last) {
          last = pct;
          console.log(`  ${done}/${jobs.length} games`);
        }
      },
    },
  );
  const situations = results.flatMap((r) => r.situations);
  const picked = new Set(results.flatMap((r) => r.picked));
  const eventOptions = new Map(content.events.map((e) => [e.id, e.choices.map((c) => c.id)]));
  const report: AssessReport = {
    meta: {
      engineVersion: ENGINE_VERSION,
      contentHash: createEngine(content).contentHash,
      seed: values.seed,
      games: jobs.length,
      rollouts: options.rollouts,
      horizonWeeks: options.horizonWeeks,
      rateBp: options.rateBp,
      situations: situations.length,
      seconds: (performance.now() - started) / 1000,
      override: values.override ?? null,
    },
    regret: regretByPersona(situations),
    verdicts: classify(eventOptions, situations, picked),
  };
  const out = fromCwd(values.out ?? join('sim-out', `${values.seed}-assess`));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'assess.json'), JSON.stringify({ ...report, situations }));
  const summary = assessMarkdown(report);
  writeFileSync(join(out, 'assess.md'), summary);
  console.log(`\n${summary}\nwrote ${out}`);
  return 0;
}

function runTrace(): number {
  if (values.file) {
    const { record, trace } = decodeTrace(readFileSync(fromCwd(values.file)));
    console.log(formatTrace(record, trace));
    return 0;
  }
  const seed = positionals[1];
  if (!seed) throw new Error('trace needs a seed, like `pnpm sim trace fastlane-3`');
  const matchup = planWithScenario(CI_PLAN).find((m) => m.matchup.id === values.matchup)?.matchup;
  if (!matchup)
    throw new Error(
      `unknown matchup ${values.matchup}; one of ${CI_PLAN.map((m) => m.matchup.id).join(', ')}`,
    );
  const { record, trace } = playTraced(createEngine(content), matchup, seed);
  console.log(formatTrace(record, trace));
  if (values.replay) {
    // The human log is every traced choice, in order: what the client's debug route replays on the board.
    const game = { setup: setupFor(matchup, seed), log: trace.map((t) => t.chosen) };
    writeFileSync(fromCwd(values.replay), JSON.stringify(game));
    console.log(`\nwrote ${values.replay}: open the client at #/replay and load it`);
  }
  return 0;
}

function loadReport(path: string): Report {
  return JSON.parse(readFileSync(path, 'utf8')) as Report;
}

/** Run the balance sim at a git ref in a temporary worktree, so `compare` can take a ref as its base. */
function reportAtRef(ref: string): Report {
  const dir = mkdtempSync(join(tmpdir(), 'fastlane-sim-'));
  // pnpm is a .cmd shim on Windows, which needs a shell; quote every argument for it.
  const shell = process.platform === 'win32';
  const run = (cmd: string, args: string[], cwd?: string) =>
    execFileSync(cmd, shell ? args.map((a) => JSON.stringify(a)) : args, {
      cwd,
      stdio: 'inherit',
      shell,
    });
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
  const mismatch = incomparable(base, head);
  if (mismatch) throw new Error(`can't pair these runs: ${mismatch}`);
  console.log(summaryMarkdown(head, compareReports(base, head)));
  return 0;
}
