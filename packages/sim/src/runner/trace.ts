/**
 * Decision traces (simulator §4, SIM-06): written as gzipped JSONL, one file per game, and printed as a readable
 * week-by-week log by `sim trace`.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { en } from '@fastlane/content';
import type { Action, DomainEvent } from '@fastlane/engine';
import type { ScoredMove } from '../game.ts';
import type { DecisionTrace, GameRecord } from './record.ts';

/** A trace file's name: matchup and seed, safe for any file system. */
export const traceFileName = (record: Pick<GameRecord, 'matchup' | 'seed'>) =>
  `${record.matchup}__${record.seed}.jsonl.gz`.replace(/[^\w.-]/g, '_');

/** The record on the first line, then one decision per line. */
export function encodeTrace(record: GameRecord, trace: DecisionTrace[]): Buffer {
  const lines = [JSON.stringify(record), ...trace.map((t) => JSON.stringify(t))];
  return gzipSync(`${lines.join('\n')}\n`);
}

export function decodeTrace(data: Buffer): { record: GameRecord; trace: DecisionTrace[] } {
  const [first, ...rest] = gunzipSync(data).toString('utf8').trim().split('\n');
  if (!first) throw new Error('empty trace');
  return {
    record: JSON.parse(first) as GameRecord,
    trace: rest.map((l) => JSON.parse(l) as DecisionTrace),
  };
}

const name = (key: string) => (en as Record<string, string>)[key] ?? key;
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** A short, readable name for an action, like "Work a shift @ Burger Bot (8h)". */
export function describeAction(action: Action | string): string {
  if (typeof action === 'string') return `option ${action}`;
  switch (action.type) {
    case 'travel':
      return `${name(`transport.${action.mode}`)} to ${name(`location.${action.to}`)}`;
    case 'endWeek':
      return 'End week';
    case 'decide':
      return `choose ${action.optionId}`;
    case 'perform': {
      const parts = [name(`action.${action.actionId}`)];
      if (action.target) parts.push(target(action.target));
      if (action.minutes) parts.push(`(${action.minutes / 60}h)`);
      if (action.amount) parts.push(dollars(action.amount));
      return parts.join(' ');
    }
  }
}

/** A target id by whichever content kind names it. */
function target(id: string): string {
  for (const kind of ['job', 'course', 'item', 'housing', 'subscription'])
    if (`${kind}.${id}` in en) return name(`${kind}.${id}`);
  return id;
}

function describeEvent(e: DomainEvent): string | null {
  switch (e.type) {
    case 'jobChanged':
      return `job ${e.change}: ${name(`job.${e.job}`)}`;
    case 'enrolled':
      return `enrolled in ${name(`course.${e.course}`)}${e.loan ? ' (loan)' : ''}`;
    case 'credentialEarned':
      return `earned ${name(`course.${e.course}`)}`;
    case 'itemBought':
      return `bought ${name(`item.${e.item}`)}`;
    case 'subscribed':
      return `subscribed to ${name(`subscription.${e.subscription}`)}`;
    case 'unsubscribed':
      return `cancelled ${name(`subscription.${e.subscription}`)}`;
    case 'moved':
      return `moved to ${name(`housing.${e.to}`)}`;
    case 'evicted':
      return 'EVICTED';
    case 'collections':
      return `${e.debt} debt in collections`;
    case 'weekendEvent':
      return `weekend event: ${name(`event.${e.event}`)}`;
    case 'eventResolved':
      return `chose ${name(`event.${e.event}.${e.choice}`)}`;
    case 'newsStarted':
      return `news: ${name(`news.${e.news}`)}`;
    case 'questCompleted':
      return `quest done: ${name(`quest.${e.quest}`)}`;
    case 'questFailed':
      return `quest failed: ${name(`quest.${e.quest}`)}`;
    case 'gigDeactivated':
      return `GigHub deactivated for ${e.weeks} weeks`;
    case 'mealSkipped':
      return 'skipped every meal (hunger penalty)';
    case 'turnEnded':
      return e.reason === 'exhausted' ? 'burned out (0 Energy)' : null;
    default:
      return null;
  }
}

const moveName = (m: ScoredMove) => describeAction(m.move);

/** The readable log `sim trace` prints (simulator §4). */
export function formatTrace(record: GameRecord, trace: DecisionTrace[]): string {
  const lines = [
    `${record.matchup} seed ${record.seed}: ${record.reason === 'win' ? `won by ${record.winnerBy}` : 'week limit'} ` +
      `in week ${record.endWeek}; scores ${record.scoresBp.map((s) => `${(s / 100).toFixed(1)}%`).join(' / ')}`,
  ];
  if (record.anomalies.length > 0) lines.push(`anomalies: ${record.anomalies.join('; ')}`);
  let week = 0;
  for (const t of trace) {
    if (t.week !== week) {
      week = t.week;
      lines.push('', `— Week ${week} —`);
    }
    const v = t.view;
    const head =
      `W${t.week} ${t.bot} [${name(`location.${v.location}`)}, ${dollars(v.cash)}, ${v.energy} En, ` +
      `${Math.floor(v.timeLeft / 60)}h left]: ${describeAction(t.chosen)}`;
    lines.push(head);
    const others = t.options.filter((o) => moveName(o) !== describeAction(t.chosen)).slice(0, 2);
    const best = t.options[0];
    if (best && others.length > 0)
      lines.push(
        `    best ${best.score} · also ${others.map((o) => `${moveName(o)} ${o.score}`).join(' · ')}`,
      );
    for (const e of t.events) {
      const text = describeEvent(e);
      if (text) lines.push(`    → ${text}`);
    }
  }
  return lines.join('\n');
}
