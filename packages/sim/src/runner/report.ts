/**
 * Reports (simulator §8): `report.json` is the machine-readable source for everything else; `summary.md` is what CI
 * posts to the job summary (CI-04). A compare (simulator §7) pairs two reports' games by matchup and seed, so the
 * difference comes from the change, not the dice.
 */
import type { BandResult, Kpis } from './kpis.ts';
import type { GameRecord } from './record.ts';

export interface ReportMeta {
  engineVersion: string;
  contentVersion: number;
  contentHash: string;
  seed: string;
  plan: string;
  games: number;
  workers: number;
  seconds: number;
  override: string | null;
  commit: string | null;
}

export interface Report {
  meta: ReportMeta;
  kpis: Kpis;
  bands: BandResult[];
  unused: Record<string, string[]>;
  records: GameRecord[];
}

export interface KpiDelta {
  kpi: string;
  base: number;
  head: number;
  /** For win rates: paired difference in basis points with a 95% interval, over games both runs played. */
  paired?: { mean: number; half: number; games: number };
}

/** Paired comparison of every KPI the two reports share. */
export function compareReports(base: Report, head: Report): KpiDelta[] {
  const baseGames = new Map(base.records.map((r) => [`${r.matchup}|${r.seed}`, r]));
  const deltas: KpiDelta[] = [];
  for (const [kpi, value] of Object.entries(head.kpis)) {
    const before = base.kpis[kpi];
    if (before === undefined) continue;
    const delta: KpiDelta = { kpi, base: before, head: value };
    const win = /^win\.(.+)$/.exec(kpi);
    if (win) {
      const diffs: number[] = [];
      for (const r of head.records) {
        if (r.matchup !== win[1]) continue;
        const b = baseGames.get(`${r.matchup}|${r.seed}`);
        if (b) diffs.push((r.winner === 'p1' ? 10_000 : 0) - (b.winner === 'p1' ? 10_000 : 0));
      }
      if (diffs.length > 1) {
        const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const variance = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (diffs.length - 1);
        const half = 1.96 * Math.sqrt(variance / diffs.length);
        delta.paired = { mean: Math.round(mean), half: Math.round(half), games: diffs.length };
      }
    }
    deltas.push(delta);
  }
  return deltas;
}

const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;

/** KPI values in their own units: rates as percentages, everything else as is. */
function show(kpi: string, value: number | null): string {
  if (value === null) return '—';
  if (/^(win|jonesWin|score|hardship|seatGap|reach)\.|^dominance$/.test(kpi)) return pct(value);
  return String(value);
}

function range(kpi: string, r: { min?: number | undefined; max?: number | undefined } | undefined) {
  if (!r) return '';
  const lo = r.min === undefined ? '' : show(kpi, r.min);
  const hi = r.max === undefined ? '' : show(kpi, r.max);
  return `${lo}–${hi}`;
}

const ICON = { ok: '✅', soft: '⚠️', hard: '❌', missing: '❔' } as const;

/** The Markdown summary for the CI job summary (CI-04). */
export function summaryMarkdown(report: Report, deltas: KpiDelta[] | null): string {
  const { meta } = report;
  const lines = [
    '### Balance sim (CI-04)',
    '',
    `${meta.games} games, engine ${meta.engineVersion}, content v${meta.contentVersion} (\`${meta.contentHash.slice(0, 12)}\`), ` +
      `seed \`${meta.seed}\`, ${meta.workers} workers, ${meta.seconds.toFixed(1)} s ` +
      `(${report.kpis.gamesPerSecond ?? 0} games/s)${meta.override ? `, override \`${meta.override}\`` : ''}`,
    '',
    '| KPI | Value | Hard band | Soft band | |',
    '|---|---|---|---|---|',
    ...report.bands.map(
      (b) =>
        `| \`${b.kpi}\` | ${show(b.kpi, b.value)} | ${range(b.kpi, b.band.hard)} | ${range(b.kpi, b.band.soft)} | ${ICON[b.status]} |`,
    ),
  ];
  const banded = new Set(report.bands.map((b) => b.kpi));
  const others = Object.entries(report.kpis).filter(([k]) => !banded.has(k));
  if (others.length > 0)
    lines.push(
      '',
      '<details><summary>Other KPIs</summary>',
      '',
      '| KPI | Value |',
      '|---|---|',
      ...others.map(([k, v]) => `| \`${k}\` | ${show(k, v)} |`),
      '',
      '</details>',
    );
  if (deltas) {
    const moved = deltas.filter((d) => d.head !== d.base);
    lines.push('', `#### Compared with the base run (${moved.length} KPIs moved)`, '');
    if (moved.length > 0)
      lines.push(
        '| KPI | Base | Head | Paired Δ (95% CI) |',
        '|---|---|---|---|',
        ...moved.map(
          (d) =>
            `| \`${d.kpi}\` | ${show(d.kpi, d.base)} | ${show(d.kpi, d.head)} | ${
              d.paired
                ? `${pct(d.paired.mean)} ± ${pct(d.paired.half)} (${d.paired.games} games)`
                : ''
            } |`,
        ),
      );
  }
  const unused = Object.entries(report.unused).filter(([, ids]) => ids.length > 0);
  if (unused.length > 0)
    lines.push(
      '',
      '<details><summary>Content no game used</summary>',
      '',
      ...unused.map(([kind, ids]) => `- **${kind}**: ${ids.join(', ')}`),
      '',
      '</details>',
    );
  return `${lines.join('\n')}\n`;
}
