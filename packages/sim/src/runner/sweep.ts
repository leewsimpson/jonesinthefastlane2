/** `sim sweep` helpers (simulator §7): turn a parameter path into an override patch, and tabulate the steps. */
import type { Report } from './report.ts';

/**
 * The override patch that sets `path` to `value`. Dots separate keys; `name[id]` picks the object with that id in
 * an array (override arrays merge by id), so `city.housing[studio].rent` patches one housing tier.
 */
export function patchAt(path: string, value: number): Record<string, unknown> {
  const parts = path.replace(/^content\./, '').split('.');
  let leaf: unknown = value;
  for (const part of [...parts].reverse()) {
    const m = /^([\w-]+)\[([\w-]+)\]$/.exec(part);
    leaf = m ? { [m[1] as string]: [{ id: m[2], ...(leaf as object) }] } : { [part]: leaf };
  }
  return leaf as Record<string, unknown>;
}

const ICON = { ok: '✅', soft: '⚠️', hard: '❌', missing: '❔' } as const;

/** KPI rows by sweep step, with band status, so the range where each band holds is visible at a glance. */
export function sweepMarkdown(param: string, steps: { value: number; report: Report }[]): string {
  const [first] = steps;
  if (!first) return '';
  const fmt = (kpi: string, v: number | null | undefined) =>
    v === null || v === undefined
      ? '—'
      : /^(win|jonesWin|score|hardship|seatGap|reach)\.|^(dominance|luckShare)$/.test(kpi)
        ? `${(v / 100).toFixed(1)}%`
        : String(v);
  const lines = [
    `### Sweep: \`${param}\``,
    '',
    `${first.report.meta.games} games per step, seed \`${first.report.meta.seed}\``,
    '',
    `| KPI | ${steps.map((s) => s.value).join(' | ')} |`,
    `|---|${steps.map(() => '---').join('|')}|`,
    ...first.report.bands.map(
      (b, i) =>
        `| \`${b.kpi}\` | ${steps
          .map((s) => {
            const r = s.report.bands[i];
            return r ? `${fmt(b.kpi, r.value)} ${ICON[r.status]}` : '—';
          })
          .join(' | ')} |`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}
