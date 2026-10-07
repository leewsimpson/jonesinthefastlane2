/**
 * "Your 2026 in review" (ENG-21): the run summary's timeline, best and worst week and story, worked out from the
 * per-week records the engine keeps (`state.history`). Events aren't saved, so everything here comes from those
 * records and works the same for a game loaded from a save. Pure.
 */
import type { GameContent } from '@fastlane/content';
import type { GameState, PlayerId, WeekRecord } from '@fastlane/engine';

export type TimelineEntry =
  | { week: number; kind: 'hired' | 'promoted' | 'newJob'; job: string }
  | { week: number; kind: 'lostJob'; job: string }
  | { week: number; kind: 'moved'; home: string }
  | { week: number; kind: 'credential'; count: number }
  | { week: number; kind: 'items'; count: number }
  | { week: number; kind: 'quest'; count: number };

export interface WeekDelta {
  week: number;
  /** Net-worth change over the week, in cents. */
  delta: number;
}

export interface Review {
  weeks: number;
  timeline: TimelineEntry[];
  best: WeekDelta | null;
  worst: WeekDelta | null;
  peak: { week: number; netWorth: number } | null;
  final: WeekRecord | null;
  jobs: number;
  moves: number;
}

const recordsOf = (state: GameState, player: PlayerId) =>
  state.history.filter((r) => r.player === player).sort((a, b) => a.week - b.week);

/** What a player had before week 1: nothing, in the cheapest home. */
function startRecord(content: GameContent, player: PlayerId): WeekRecord {
  return {
    week: 0,
    player,
    cash: 0,
    netWorth: 0,
    progressBp: { wealth: 0, wellbeing: 0, career: 0, skills: 0 },
    scoreBp: 0,
    job: null,
    jobLevel: 0,
    housing: content.city.housing[0]?.id ?? '',
    credentials: 0,
    items: 0,
    questsDone: 0,
  };
}

export function timeline(content: GameContent, records: readonly WeekRecord[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let prev = records[0] ? startRecord(content, records[0].player) : null;
  for (const r of records) {
    if (!prev) break;
    const { week } = r;
    if (r.job !== prev.job) {
      if (r.job === null) out.push({ week, kind: 'lostJob', job: prev.job ?? '' });
      else if (prev.job === null) out.push({ week, kind: 'hired', job: r.job });
      else if (r.jobLevel > prev.jobLevel) out.push({ week, kind: 'promoted', job: r.job });
      else out.push({ week, kind: 'newJob', job: r.job });
    }
    if (r.housing !== prev.housing) out.push({ week, kind: 'moved', home: r.housing });
    if (r.credentials > prev.credentials)
      out.push({ week, kind: 'credential', count: r.credentials - prev.credentials });
    if (r.items > prev.items) out.push({ week, kind: 'items', count: r.items - prev.items });
    if (r.questsDone > prev.questsDone)
      out.push({ week, kind: 'quest', count: r.questsDone - prev.questsDone });
    prev = r;
  }
  return out;
}

/** Best and worst week by net-worth change, from week 2 on (week 1 has no week before it to compare). */
export function bestAndWorst(records: readonly WeekRecord[]): {
  best: WeekDelta | null;
  worst: WeekDelta | null;
} {
  let best: WeekDelta | null = null;
  let worst: WeekDelta | null = null;
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1];
    const b = records[i];
    if (!a || !b) continue;
    const d = { week: b.week, delta: b.netWorth - a.netWorth };
    if (!best || d.delta > best.delta) best = d;
    if (!worst || d.delta < worst.delta) worst = d;
  }
  // One week can't be both: with a single comparison it is only "best" or "worst" by its sign.
  if (best && worst && best.week === worst.week) {
    if (best.delta >= 0) worst = null;
    else best = null;
  }
  return { best, worst };
}

export function review(content: GameContent, state: GameState, player: PlayerId): Review {
  const records = recordsOf(state, player);
  const line = timeline(content, records);
  let peak: Review['peak'] = null;
  for (const r of records)
    if (!peak || r.netWorth > peak.netWorth) peak = { week: r.week, netWorth: r.netWorth };
  return {
    weeks: records.length,
    timeline: line,
    ...bestAndWorst(records),
    peak,
    final: records.at(-1) ?? null,
    jobs: new Set(records.map((r) => r.job).filter((j) => j !== null)).size,
    moves: line.filter((e) => e.kind === 'moved').length,
  };
}
