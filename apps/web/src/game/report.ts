/**
 * The end-of-week sequence (FR-05, ENG-10): what the player sees between ending a week and starting the next.
 * A report collects the domain events from the moment a human's turn ends until a human must act again: their own
 * end-of-turn steps, any decision, other players' turns (Jones's included) and the round steps. The pages are
 * worked out from those events, in the order the plan gives: bills → event card → news → goal progress → Jones
 * recap → teaser.
 */
import type { DomainEvent, GameState, PlayerId } from '@fastlane/engine';

export const REPORT_STEPS = ['summary', 'event', 'news', 'goals', 'rival', 'teaser'] as const;
export type ReportStep = (typeof REPORT_STEPS)[number];

export interface WeekReport {
  /** The human whose turn just ended. */
  player: PlayerId;
  /** The week that ended. */
  week: number;
  events: DomainEvent[];
}

const has = (events: readonly DomainEvent[], test: (e: DomainEvent) => boolean) =>
  events.some(test);

/** The pages to show, given what has happened so far. Later pages appear once a pending decision is made. */
export function reportSteps(report: WeekReport, state: GameState): ReportStep[] {
  const { events, player } = report;
  const shown: Record<ReportStep, boolean> = {
    summary: true,
    event:
      state.pending?.player === player ||
      has(events, (e) => e.type === 'weekendEvent' && e.player === player),
    news: has(
      events,
      (e) => e.type === 'newsStarted' || e.type === 'newsEnded' || e.type === 'marketMoved',
    ),
    goals: has(events, (e) => e.type === 'standings'),
    rival: has(events, (e) => e.type === 'rivalPost' || e.type === 'overtaken'),
    teaser: has(events, (e) => e.type === 'teaser'),
  };
  return REPORT_STEPS.filter((s) => shown[s]);
}

/**
 * Where a batch of events stops being "this turn" and starts being the end of the week: the index of the active
 * human's `turnEnded`, or -1. An action can end the turn by itself (out of time, exhausted).
 */
export function turnEndIndex(events: readonly DomainEvent[], player: PlayerId): number {
  return events.findIndex((e) => e.type === 'turnEnded' && e.player === player);
}

/** Events about one player, in order. */
export function eventsFor<T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
  player?: PlayerId,
): Extract<DomainEvent, { type: T }>[] {
  return events.filter(
    (e): e is Extract<DomainEvent, { type: T }> =>
      e.type === type && (player === undefined || !('player' in e) || e.player === player),
  );
}

/** Net change per stat over some events, for one player, ignoring cash (money moves are listed separately). */
export function statTotals(
  events: readonly DomainEvent[],
  player: PlayerId,
  include: (e: Extract<DomainEvent, { type: 'statChanged' }>) => boolean = () => true,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events)
    if (e.type === 'statChanged' && e.player === player && e.stat !== 'cash' && include(e))
      totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.to - e.from);
  for (const [k, v] of totals) if (v === 0) totals.delete(k);
  return totals;
}

/** The active human, or null while the game is over. */
export function activeHuman(state: GameState): PlayerId | null {
  if (state.pending) return state.pending.player;
  return state.phase.kind === 'turn' ? state.phase.player : null;
}

export const humanCount = (state: GameState) =>
  state.players.filter((p) => p.controller === 'human').length;
