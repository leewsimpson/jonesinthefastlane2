/**
 * Outcome KPIs (simulator §5) from game records, and the band check against `@fastlane/content/sim` bands. Rates
 * and shares are basis points; weeks are weeks. A KPI with no games behind it is left out rather than reported as 0.
 */
import type { GameContent } from '@fastlane/content';
import type { KpiBand } from '@fastlane/content/sim';
import type { GameRecord } from './record.ts';

export type Kpis = Record<string, number>;

const bp = (part: number, whole: number) => Math.round((part * 10_000) / whole);

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Records by matchup id. */
function byMatchup(records: GameRecord[]): Map<string, GameRecord[]> {
  const out = new Map<string, GameRecord[]>();
  for (const r of records) out.set(r.matchup, [...(out.get(r.matchup) ?? []), r]);
  return out;
}

/** Floor bots (simulator §3, §5): they set the floor, so their win rates don't count towards dominance. */
const FLOORS = new Set(['gigger', 'idle', 'random']);

export function computeKpis(content: GameContent, records: GameRecord[], seconds: number): Kpis {
  const kpis: Kpis = {};
  const groups = byMatchup(records);
  const standardWins: number[] = [];
  for (const [id, games] of groups) {
    const [first] = games;
    if (!first) continue;
    const bot = first.seats[0] ?? '?';
    const wins = games.filter((g) => g.winner === 'p1').length;
    if (first.seats.includes('jones')) {
      kpis[`win.${id}`] = bp(wins, games.length);
      kpis[`jonesWin.${id}`] = bp(games.filter((g) => g.winnerBy === 'jones').length, games.length);
      kpis[`score.${id}`] = Math.round(
        games.reduce((sum, g) => sum + (g.scoresBp[0] ?? 0), 0) / games.length,
      );
      if (id.endsWith('-standard') && !FLOORS.has(bot)) standardWins.push(kpis[`win.${id}`] ?? 0);
    } else if (first.seats.length === 2) {
      // Seat fairness (FR-05a, FR-11): the same bot in both seats should win equally often.
      const second = games.filter((g) => g.winner === 'p2').length;
      kpis[`seatGap.${id}`] = Math.abs(bp(wins, games.length) - bp(second, games.length));
    }
  }

  const balanced = groups.get('balanced-standard') ?? [];
  if (balanced.length > 0) {
    const won = balanced.filter((g) => g.winner === 'p1').map((g) => g.endWeek);
    const winWeek = median(won);
    if (winWeek !== undefined) kpis['winWeek.balanced-standard'] = winWeek;
    const hard = balanced.filter((g) => {
      const s = g.setbacks[0];
      return s && s.evictions + s.collections + s.burnouts + s.layoffs > 0;
    });
    kpis['hardship.balanced-standard'] = bp(hard.length, balanced.length);
    const paid = balanced.flatMap((g) =>
      g.firstPaycheck[0] === null ? [] : [g.firstPaycheck[0] ?? 0],
    );
    const paycheck = median(paid);
    if (paycheck !== undefined) kpis['firstPaycheck.balanced-standard'] = paycheck;
    const milestone = median(
      balanced.flatMap((g) => (g.firstMilestone?.[0] == null ? [] : [g.firstMilestone[0]])),
    );
    if (milestone !== undefined) kpis['firstMilestone.balanced-standard'] = milestone;
  }

  const luck = luckShare(groups);
  if (luck !== undefined) kpis.luckShare = luck;
  kpis.anomalies = records.filter((r) => (r.anomalies?.length ?? 0) > 0).length;

  standardWins.sort((a, b) => b - a);
  if (standardWins.length >= 2) kpis.dominance = (standardWins[0] ?? 0) - (standardWins[1] ?? 0);

  const reach = (used: (r: GameRecord) => string[], all: string[]) => {
    const seen = new Set(records.flatMap(used));
    return bp(all.filter((id) => seen.has(id)).length, Math.max(1, all.length));
  };
  kpis['reach.events'] = reach(
    (r) => r.events,
    content.events.map((e) => e.id),
  );
  kpis['reach.choices'] = reach(
    (r) => r.choices,
    content.events.flatMap((e) => e.choices.map((c) => `${e.id}.${c.id}`)),
  );
  kpis['reach.news'] = reach(
    (r) => r.news,
    content.news.map((n) => n.id),
  );
  kpis['reach.jobs'] = reach(
    (r) => r.jobs,
    content.city.jobs.map((j) => j.id),
  );
  kpis['reach.quests'] = reach(
    (r) => r.quests,
    content.quests.map((q) => q.id),
  );
  kpis.gamesPerSecond = Math.round((records.length / Math.max(seconds, 0.001)) * 100) / 100;
  return kpis;
}

const variance = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
};

/**
 * Luck share (simulator §5): of the spread in final score among non-floor personas against Standard Jones, the part
 * that comes from the seed (variance within a persona) rather than the strategy (variance between persona means),
 * in basis points. Skill should explain more than luck, so this should stay under half.
 */
export function luckShare(groups: Map<string, GameRecord[]>): number | undefined {
  const scores: number[][] = [];
  for (const [id, games] of groups) {
    const bot = games[0]?.seats[0] ?? '';
    if (!id.endsWith('-standard') || FLOORS.has(bot) || !games[0]?.seats.includes('jones'))
      continue;
    if (games.length >= 2) scores.push(games.map((g) => g.scoresBp[0] ?? 0));
  }
  if (scores.length < 2) return undefined;
  const within = scores.reduce((a, xs) => a + variance(xs), 0) / scores.length;
  const between = variance(scores.map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length));
  return within + between === 0 ? 0 : bp(within, within + between);
}

/** Content no game used: candidates for dead content (simulator §6). */
export function unusedContent(content: GameContent, records: GameRecord[]) {
  const missing = (used: (r: GameRecord) => string[], all: string[]) => {
    const seen = new Set(records.flatMap(used));
    return all.filter((id) => !seen.has(id));
  };
  return {
    events: missing(
      (r) => r.events,
      content.events.map((e) => e.id),
    ),
    choices: missing(
      (r) => r.choices,
      content.events.flatMap((e) => e.choices.map((c) => `${e.id}.${c.id}`)),
    ),
    news: missing(
      (r) => r.news,
      content.news.map((n) => n.id),
    ),
    jobs: missing(
      (r) => r.jobs,
      content.city.jobs.map((j) => j.id),
    ),
    items: missing(
      (r) => r.items,
      content.city.items.filter((i) => !i.meals).map((i) => i.id),
    ),
    quests: missing(
      (r) => r.quests,
      content.quests.map((q) => q.id),
    ),
  };
}

export type BandStatus = 'ok' | 'soft' | 'hard' | 'missing';

export interface BandResult {
  kpi: string;
  value: number | null;
  band: KpiBand;
  status: BandStatus;
}

const inside = (v: number, r: { min?: number | undefined; max?: number | undefined }) =>
  (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);

/** Each band against its KPI: outside the hard range fails CI; outside the soft range warns (simulator §5). */
export function checkBands(kpis: Kpis, bands: readonly KpiBand[]): BandResult[] {
  return bands.map((band) => {
    const value = kpis[band.kpi];
    if (value === undefined) return { kpi: band.kpi, value: null, band, status: 'missing' };
    const status: BandStatus = !inside(value, band.hard)
      ? 'hard'
      : band.soft && !inside(value, band.soft)
        ? 'soft'
        : 'ok';
    return { kpi: band.kpi, value, band, status };
  });
}
