/**
 * Play-time instrumentation (ENG-20, ENG-02): how long a player took to their first paycheck and how long each of
 * their weeks took, in active play time. Time only counts between inputs, and a gap longer than `IDLE_CAP_MS`
 * counts as that cap, so a player who walks away doesn't skew the numbers. Kept with the save (not in the engine
 * state: wall-clock time must never reach the engine) and shown on the run summary for testers.
 */
import type { PlayerId } from '@fastlane/engine';

export const IDLE_CAP_MS = 90_000;

export interface WeekPace {
  player: PlayerId;
  week: number;
  ms: number;
}

export interface Pace {
  /** Active play time so far. */
  playMs: number;
  /** Epoch ms of the last input this session; null after loading, so time away never counts. */
  lastAt: number | null;
  /** `playMs` when the current turn started. */
  turnStartMs: number;
  /** `playMs` at each human's first wage. */
  firstPayMs: Record<PlayerId, number>;
  weeks: WeekPace[];
}

export const newPace = (): Pace => ({
  playMs: 0,
  lastAt: null,
  turnStartMs: 0,
  firstPayMs: {},
  weeks: [],
});

/** Count the time since the last input (capped), as of `now`. */
export function tick(p: Pace, now: number): Pace {
  const gap = p.lastAt === null ? 0 : Math.min(IDLE_CAP_MS, Math.max(0, now - p.lastAt));
  return { ...p, playMs: p.playMs + gap, lastAt: now };
}

export const markTurnStart = (p: Pace): Pace => ({ ...p, turnStartMs: p.playMs });

export function recordTurnEnd(p: Pace, player: PlayerId, week: number): Pace {
  return { ...p, weeks: [...p.weeks, { player, week, ms: p.playMs - p.turnStartMs }] };
}

export function recordFirstPay(p: Pace, player: PlayerId): Pace {
  if (p.firstPayMs[player] !== undefined) return p;
  return { ...p, firstPayMs: { ...p.firstPayMs, [player]: p.playMs } };
}

/** Median week length for a player, skipping week 1 (the tutorial week), or null with too few weeks. */
export function medianWeekMs(p: Pace, player: PlayerId): number | null {
  const ms = p.weeks
    .filter((w) => w.player === player && w.week > 1)
    .map((w) => w.ms)
    .sort((a, b) => a - b);
  if (ms.length === 0) return null;
  const mid = Math.floor(ms.length / 2);
  return ms.length % 2 ? (ms[mid] ?? null) : Math.round(((ms[mid - 1] ?? 0) + (ms[mid] ?? 0)) / 2);
}

/** Parses a stored pace, or starts afresh: saves from before Phase 5 have none. */
export function parsePace(v: unknown): Pace {
  if (!v || typeof v !== 'object') return newPace();
  const o = v as Partial<Pace>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    playMs: num(o.playMs),
    lastAt: null,
    turnStartMs: num(o.turnStartMs),
    firstPayMs:
      o.firstPayMs && typeof o.firstPayMs === 'object'
        ? Object.fromEntries(Object.entries(o.firstPayMs).filter(([, x]) => typeof x === 'number'))
        : {},
    weeks: Array.isArray(o.weeks)
      ? o.weeks.filter(
          (w): w is WeekPace =>
            !!w &&
            typeof w.player === 'string' &&
            typeof w.week === 'number' &&
            typeof w.ms === 'number',
        )
      : [],
  };
}
