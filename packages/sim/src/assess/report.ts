/** The `sim assess` summary (simulator §6, §8): a verdict per weekend event and the bots' regret. */
import type { ChoiceVerdict } from './assess.ts';

export interface AssessReport {
  meta: {
    engineVersion: string;
    contentHash: string;
    seed: string;
    games: number;
    rollouts: number;
    horizonWeeks: number;
    rateBp: number;
    situations: number;
    seconds: number;
    override: string | null;
  };
  regret: Record<string, number>;
  verdicts: ChoiceVerdict[];
}

const ORDER: ChoiceVerdict['class'][] = ['no-brainer', 'trap', 'dead', 'flat', 'meaningful'];
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;

export function assessMarkdown(report: AssessReport): string {
  const { meta } = report;
  const counts = ORDER.map((c) => `${report.verdicts.filter((v) => v.class === c).length} ${c}`);
  const lines = [
    '### Choice assessment (simulator §6)',
    '',
    `${meta.games} games, ${meta.situations} decisions assessed (${pct(meta.rateBp)} sampled), ` +
      `${meta.rollouts} rollouts × ${meta.horizonWeeks} weeks, ${meta.seconds.toFixed(1)} s` +
      (meta.override ? `, override \`${meta.override}\`` : ''),
    '',
    counts.join(' · '),
    '',
    '| Bot | Mean regret |',
    '|---|---|',
    ...Object.entries(report.regret).map(([p, r]) => `| ${p} | ${pct(r)} |`),
    '',
    '| Event | Class | About | Cases | Options (best / picked / regret) | Note |',
    '|---|---|---|---|---|---|',
    ...[...report.verdicts]
      .sort(
        (a, b) => ORDER.indexOf(a.class) - ORDER.indexOf(b.class) || a.event.localeCompare(b.event),
      )
      .map(
        (v) =>
          `| ${v.event} | ${v.class} | ${v.about.join(', ')} | ${v.situations} | ${Object.entries(
            v.options,
          )
            .map(([id, o]) => `${id} ${pct(o.bestShare)}/${pct(o.pickShare)}/${pct(o.meanRegret)}`)
            .join('; ')} | ${v.note} |`,
      ),
  ];
  return `${lines.join('\n')}\n`;
}
