/**
 * `report.html` (simulator §8, SIM-10): one self-contained file with no scripts or external assets. Charts are
 * inline SVG: win rates by matchup, the game-length histogram and net-worth fan charts, plus the band table,
 * paired deltas, anomalies and unused content.
 */
import { median } from './kpis.ts';
import type { GameRecord } from './record.ts';
import type { KpiDelta, Report } from './report.ts';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;
const isRate = (kpi: string) =>
  /^(win|jonesWin|score|hardship|seatGap|reach)\.|^(dominance|luckShare)$/.test(kpi);
const show = (kpi: string, v: number | null) =>
  v === null ? '—' : isRate(kpi) ? pct(v) : String(v);

const W = 640;

/** Horizontal bars: share of games won by the human seat and by Jones, per matchup. */
function winBars(report: Report): string {
  const rows = [...new Set(report.records.map((r) => r.matchup))].map((id) => ({
    id,
    win: report.kpis[`win.${id}`],
    jones: report.kpis[`jonesWin.${id}`],
  }));
  const rowH = 22;
  const left = 190;
  const scale = (bp: number) => ((W - left - 60) * bp) / 10_000;
  const bars = rows
    .map((r, i) => {
      const y = i * rowH + 4;
      const win = r.win ?? 0;
      const jones = r.jones ?? 0;
      return (
        `<text x="${left - 8}" y="${y + 13}" text-anchor="end" class="label">${esc(r.id)}</text>` +
        `<rect x="${left}" y="${y}" width="${scale(win)}" height="8" class="s1"><title>${esc(r.id)} human wins ${pct(win)}</title></rect>` +
        (r.jones === undefined
          ? ''
          : `<rect x="${left}" y="${y + 9}" width="${scale(jones)}" height="8" class="s2"><title>${esc(r.id)} Jones wins ${pct(jones)}</title></rect>`) +
        `<text x="${left + scale(Math.max(win, jones)) + 6}" y="${y + 13}" class="value">${r.win === undefined ? '' : pct(win)}</text>`
      );
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH + 8}" role="img" aria-label="Win rate by matchup">${bars}</svg>
<p class="legend"><span class="key s1"></span> human seat wins <span class="key s2"></span> Jones wins</p>`;
}

/** Weeks to a win for one matchup, one bar per week. */
function lengthHistogram(records: GameRecord[]): string {
  const weeks = records.filter((r) => r.reason === 'win').map((r) => r.endWeek);
  if (weeks.length === 0) return '<p>No wins.</p>';
  const max = Math.max(...weeks, 52);
  const counts = Array.from({ length: max + 1 }, (_, w) => weeks.filter((x) => x === w).length);
  const top = Math.max(...counts);
  const H = 140;
  const bw = (W - 40) / max;
  const bars = counts
    .map((c, w) =>
      c === 0
        ? ''
        : `<rect x="${30 + (w - 1) * bw}" y="${H - (c / top) * (H - 20)}" width="${Math.max(1, bw - 1)}" height="${(c / top) * (H - 20)}" class="s1"><title>week ${w}: ${c} games</title></rect>`,
    )
    .join('');
  const ticks = [1, 10, 20, 30, 40, 52]
    .map(
      (w) =>
        `<text x="${30 + (w - 0.5) * bw}" y="${H + 14}" text-anchor="middle" class="label">${w}</text>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="Weeks to win">${bars}<line x1="30" x2="${W - 10}" y1="${H}" y2="${H}" class="axis"/>${ticks}</svg>
<p class="legend">median week ${median(weeks)}, ${weeks.length} wins</p>`;
}

/** Net worth of the first seat by week: the 10th–90th percentile band and the median line. */
function netWorthFan(records: GameRecord[]): string {
  const series = records.map((r) => r.netWorthByWeek?.[0] ?? []).filter((s) => s.length > 0);
  if (series.length === 0) return '<p>No net-worth data in this report.</p>';
  const weeks = Math.max(...series.map((s) => s.length));
  const at = (q: number) =>
    Array.from({ length: weeks }, (_, w) => {
      const vals = series
        .flatMap((s) => (s[w] === undefined ? [] : [s[w] as number]))
        .sort((a, b) => a - b);
      return vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))] ?? 0;
    });
  const p10 = at(0.1);
  const p50 = at(0.5);
  const p90 = at(0.9);
  const lo = Math.min(0, ...p10);
  const hi = Math.max(1, ...p90);
  const H = 160;
  const x = (w: number) => 50 + (w * (W - 60)) / Math.max(1, weeks - 1);
  const y = (v: number) => 10 + ((hi - v) * (H - 20)) / (hi - lo);
  const band = `${p90.map((v, w) => `${x(w)},${y(v)}`).join(' ')} ${p10
    .map((v, w) => `${x(w)},${y(v)}`)
    .reverse()
    .join(' ')}`;
  const line = p50.map((v, w) => `${x(w)},${y(v)}`).join(' ');
  const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  return `<svg viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="Net worth by week">
<polygon points="${band}" class="band"/><polyline points="${line}" class="line"/>
<line x1="50" x2="${W - 10}" y1="${y(0)}" y2="${y(0)}" class="axis"/>
<text x="44" y="${y(hi) + 4}" text-anchor="end" class="label">${money(hi)}</text>
<text x="44" y="${y(lo) + 4}" text-anchor="end" class="label">${money(lo)}</text>
<text x="${x(0)}" y="${H + 14}" class="label">week 1</text>
<text x="${x(weeks - 1)}" y="${H + 14}" text-anchor="end" class="label">week ${weeks}</text></svg>
<p class="legend">median line, 10th–90th percentile band, ${series.length} games (games stop when someone wins)</p>`;
}

export function htmlReport(report: Report, deltas: KpiDelta[] | null): string {
  const { meta } = report;
  const balanced = report.records.filter((r) => r.matchup === 'balanced-standard');
  const anomalies = report.records.filter((r) => (r.anomalies?.length ?? 0) > 0);
  const bandRows = report.bands
    .map(
      (b) =>
        `<tr class="${b.status}"><td><code>${esc(b.kpi)}</code></td><td>${show(b.kpi, b.value)}</td>` +
        `<td>${b.band.hard.min === undefined ? '' : show(b.kpi, b.band.hard.min)}–${b.band.hard.max === undefined ? '' : show(b.kpi, b.band.hard.max)}</td>` +
        `<td>${b.band.soft ? `${b.band.soft.min === undefined ? '' : show(b.kpi, b.band.soft.min)}–${b.band.soft.max === undefined ? '' : show(b.kpi, b.band.soft.max)}` : ''}</td>` +
        `<td>${b.status}</td></tr>`,
    )
    .join('');
  const deltaRows = (deltas ?? [])
    .filter((d) => d.head !== d.base && d.kpi !== 'gamesPerSecond')
    .map(
      (d) =>
        `<tr><td><code>${esc(d.kpi)}</code></td><td>${show(d.kpi, d.base)}</td><td>${show(d.kpi, d.head)}</td>` +
        `<td>${d.paired ? `${pct(d.paired.mean)} ± ${pct(d.paired.half)}` : ''}</td></tr>`,
    )
    .join('');
  const unused = Object.entries(report.unused)
    .filter(([, ids]) => ids.length > 0)
    .map(([kind, ids]) => `<li><b>${esc(kind)}</b>: ${ids.map(esc).join(', ')}</li>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Balance report</title>
<style>
:root { --bg:#fbfaf7; --fg:#1d1b18; --muted:#6b665e; --s1:#2a6fdb; --s2:#d9572b; --ok:#e6f4ea; --soft:#fff4d6; --hard:#fde2e1; --line:#d8d3ca; }
@media (prefers-color-scheme: dark) { :root { --bg:#16151a; --fg:#ece9e4; --muted:#a09a90; --s1:#6ea0f0; --s2:#f08a62; --ok:#1e3326; --soft:#3a3218; --hard:#3d1f1f; --line:#3a3740; } }
body { background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, sans-serif; margin:0 auto; max-width:760px; padding:16px; }
h1 { font-size:1.4rem; } h2 { font-size:1.1rem; margin-top:2rem; }
table { border-collapse:collapse; width:100%; font-size:13px; } td, th { border-bottom:1px solid var(--line); padding:4px 6px; text-align:left; }
tr.ok td:last-child { background:var(--ok); } tr.soft td:last-child { background:var(--soft); } tr.hard td:last-child, tr.missing td:last-child { background:var(--hard); }
svg { width:100%; height:auto; } .label, .value { fill:var(--muted); font-size:11px; } .s1 { fill:var(--s1); } .s2 { fill:var(--s2); }
.band { fill:var(--s1); opacity:.25; } .line { fill:none; stroke:var(--s1); stroke-width:2; } .axis { stroke:var(--line); }
.legend { color:var(--muted); font-size:13px; } .key { display:inline-block; width:10px; height:10px; } .key.s1 { background:var(--s1); } .key.s2 { background:var(--s2); }
.scroll { overflow-x:auto; }
</style></head><body>
<h1>Balance report</h1>
<p class="legend">${meta.games} games · engine ${esc(meta.engineVersion)} · content <code>${esc(meta.contentHash.slice(0, 12))}</code> · seed <code>${esc(meta.seed)}</code> · plan ${esc(meta.plan)} · ${meta.seconds.toFixed(0)} s${meta.override ? ` · override <code>${esc(meta.override)}</code>` : ''}${meta.commit ? ` · commit <code>${esc(meta.commit.slice(0, 10))}</code>` : ''}</p>
<h2>KPI bands</h2><div class="scroll"><table><thead><tr><th>KPI</th><th>Value</th><th>Hard</th><th>Soft</th><th></th></tr></thead><tbody>${bandRows}</tbody></table></div>
${deltaRows ? `<h2>Compared with the base run</h2><div class="scroll"><table><thead><tr><th>KPI</th><th>Base</th><th>Head</th><th>Paired Δ (95% CI)</th></tr></thead><tbody>${deltaRows}</tbody></table></div>` : ''}
<h2>Win rate by matchup</h2>${winBars(report)}
<h2>Weeks to win: balanced vs Standard Jones</h2>${lengthHistogram(balanced)}
<h2>Net worth: balanced vs Standard Jones</h2>${netWorthFan(balanced)}
<h2>Anomalies (${anomalies.length} games)</h2>${
    anomalies.length
      ? `<ul>${anomalies
          .slice(0, 50)
          .map(
            (r) =>
              `<li><code>${esc(r.matchup)} ${esc(r.seed)}</code>: ${r.anomalies.map(esc).join('; ')}</li>`,
          )
          .join(
            '',
          )}</ul><p class="legend">Read one with <code>pnpm sim trace &lt;seed&gt; --matchup &lt;matchup&gt;</code>.</p>`
      : '<p>None.</p>'
  }
<h2>Content no game used</h2>${unused ? `<ul>${unused}</ul>` : '<p>Everything was used.</p>'}
</body></html>
`;
}
