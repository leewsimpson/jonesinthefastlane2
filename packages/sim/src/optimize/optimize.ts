/**
 * `sim optimize` (simulator §3, SIM-09): the optimizer and its base persona play the same seeds against Jones, so the
 * gap between them is the lookahead's, not the dice's. The report lists the leads (moves the optimizer found that
 * beat the base persona's by a wide margin), grouped by move, with how often and by how much.
 */
import type { Difficulty, GameContent } from '@fastlane/content';
import type { Engine, GameState } from '@fastlane/engine';
import { type Lead, type OptimizerOptions, optimizerBot } from '../bots/optimizer.ts';
import { playGame } from '../game.ts';
import { botFor, type Matchup, setupFor } from '../runner/record.ts';

export interface OptimizeJob {
  seed: string;
  difficulty: Difficulty;
  weekLimit: number;
}

export interface Outcome {
  win: boolean;
  /** The week the game ended. */
  week: number;
  scoreBp: number;
}

export interface OptimizeResult {
  seed: string;
  optimizer: Outcome;
  base: Outcome;
  leads: Lead[];
  ms: number;
}

const outcome = (state: GameState): Outcome => {
  if (state.phase.kind !== 'gameOver') throw new Error('game did not end');
  const { result } = state.phase;
  return {
    win: result.reason === 'win' && result.winner === 'p1',
    week: result.week,
    scoreBp: result.scores.p1 ?? 0,
  };
};

export function optimizeGame(
  engine: Engine,
  content: GameContent,
  job: OptimizeJob,
  options: OptimizerOptions,
): OptimizeResult {
  const started = performance.now();
  const matchup = (bot: string): Matchup => ({
    id: `${bot}-${job.difficulty}`,
    bots: [bot],
    jones: job.difficulty,
    difficulty: job.difficulty,
    weekLimit: job.weekLimit,
  });
  const bot = optimizerBot(content, job.seed, options);
  const opt = playGame(engine, setupFor(matchup('optimizer'), job.seed), [bot]);
  const base = playGame(engine, setupFor(matchup(options.base), job.seed), [
    botFor(content, options.base, job.seed),
  ]);
  return {
    seed: job.seed,
    optimizer: outcome(opt.state),
    base: outcome(base.state),
    leads: bot.leads,
    ms: performance.now() - started,
  };
}

export interface LeadGroup {
  found: string;
  instead: string;
  count: number;
  games: number;
  meanGainBp: number;
  maxGainBp: number;
  example: { seed: string; week: number };
}

/** Leads grouped by the move found and the move it replaced, biggest total gain first. */
export function groupLeads(results: OptimizeResult[]): LeadGroup[] {
  const groups = new Map<string, LeadGroup & { total: number; seeds: Set<string> }>();
  for (const r of results)
    for (const lead of r.leads) {
      const key = `${lead.found}\u0000${lead.instead}`;
      const g = groups.get(key) ?? {
        found: lead.found,
        instead: lead.instead,
        count: 0,
        games: 0,
        meanGainBp: 0,
        maxGainBp: 0,
        example: { seed: lead.seed, week: lead.week },
        total: 0,
        seeds: new Set<string>(),
      };
      g.count++;
      g.total += lead.gainBp;
      g.seeds.add(lead.seed);
      if (lead.gainBp > g.maxGainBp) {
        g.maxGainBp = lead.gainBp;
        g.example = { seed: lead.seed, week: lead.week };
      }
      groups.set(key, g);
    }
  return [...groups.values()]
    .map(({ total, seeds, ...g }) => ({
      ...g,
      games: seeds.size,
      meanGainBp: Math.round(total / g.count),
    }))
    .sort((a, b) => b.meanGainBp * b.count - a.meanGainBp * a.count);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

export function summarise(results: OptimizeResult[], base: string) {
  const side = (pick: (r: OptimizeResult) => Outcome) => {
    const outs = results.map(pick);
    const wins = outs.filter((o) => o.win);
    return {
      wins: wins.length,
      winRate: outs.length ? wins.length / outs.length : 0,
      medianWinWeek: median(wins.map((o) => o.week)),
      meanScoreBp: Math.round(outs.reduce((a, o) => a + o.scoreBp, 0) / Math.max(1, outs.length)),
    };
  };
  return {
    games: results.length,
    base,
    optimizer: side((r) => r.optimizer),
    baseline: side((r) => r.base),
  };
}

export function optimizeMarkdown(
  summary: ReturnType<typeof summarise>,
  groups: LeadGroup[],
  meta: string,
): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const row = (name: string, s: ReturnType<typeof summarise>['optimizer']) =>
    `| ${name} | ${s.wins}/${summary.games} (${pct(s.winRate)}) | ${s.medianWinWeek ?? '—'} | ${(s.meanScoreBp / 100).toFixed(1)}% |`;
  return [
    '# Exploit search (sim optimize)',
    '',
    meta,
    '',
    '| Player | Wins | Median win week | Mean score |',
    '|---|---|---|---|',
    row('optimizer', summary.optimizer),
    row(summary.base, summary.baseline),
    '',
    '## Leads',
    '',
    "Moves the optimizer found that beat the base persona's pick by a wide margin over the rollout horizon. A lead",
    'seen across many games is either a move the scorer undervalues (tune `ai.json`) or a hole in the economy (tune',
    'content). Replay an example with `pnpm sim trace <seed>`.',
    '',
    groups.length === 0
      ? 'None.'
      : [
          '| Found | Instead of | Times | Games | Mean gain | Max gain | Example |',
          '|---|---|---|---|---|---|---|',
          ...groups
            .slice(0, 20)
            .map(
              (g) =>
                `| ${g.found} | ${g.instead} | ${g.count} | ${g.games} | ${(g.meanGainBp / 100).toFixed(1)} pts | ${(g.maxGainBp / 100).toFixed(1)} pts | ${g.example.seed} w${g.example.week} |`,
            ),
        ].join('\n'),
    '',
  ].join('\n');
}
