/**
 * The week-1 coach (ENG-20): a few steps woven into the first week that take a new player from nothing to their first
 * paycheck — find a job, take it, get to work, work a shift — then point at the week's other needs. Pure: the step
 * comes from the state, so it follows whatever the player does (clicking the board, the Go button or the keyboard)
 * and picks up again after a reload.
 */
import type { GameContent } from '@fastlane/content';
import type { GameState, PlayerState } from '@fastlane/engine';

export type CoachStepId = 'findJob' | 'apply' | 'goWork' | 'work' | 'paid';

/** Where the step points: matched against `data-coach` on the UI element. `go` is the coach's own Go button. */
export type CoachTarget = 'go' | 'actions' | 'quick' | 'end';

export interface CoachStep {
  id: CoachStepId;
  target: CoachTarget;
  /** 1-based position, for "2 of 5". */
  n: number;
  /** For copy: a location id. */
  location?: string;
}

export const COACH_STEPS: readonly CoachStepId[] = ['findJob', 'apply', 'goWork', 'work', 'paid'];

/** The coach stays on until the first paycheck or the end of this week, whichever comes later. */
export const COACH_LAST_WEEK = 2;

/** Whether a player has worked a shift yet. Shifts pay when they end (FR-43), so this is "has been paid". */
export const hasWorked = (p: PlayerState): boolean =>
  Object.values(p.experience).some((minutes) => minutes > 0);

const step = (id: CoachStepId, target: CoachTarget, location?: string): CoachStep => ({
  id,
  target,
  n: COACH_STEPS.indexOf(id) + 1,
  ...(location ? { location } : {}),
});

export function coachStep(
  content: GameContent,
  state: GameState,
  me: PlayerState,
  paid: boolean,
): CoachStep | null {
  if (state.week > COACH_LAST_WEEK) return null;
  if (paid) return state.week === 1 ? step('paid', 'end') : null;
  const jobBoard = content.city.actions.find((a) => a.kind === 'apply-job')?.location;
  if (!me.job) {
    if (jobBoard && me.location !== jobBoard) return step('findJob', 'go', jobBoard);
    return step('apply', 'actions');
  }
  const job = content.city.jobs.find((j) => j.id === me.job?.id);
  if (!job) return null;
  // Remote jobs are worked from home.
  const workAt = job.remote ? content.city.board.home : job.location;
  if (me.location === workAt) return step('work', 'quick', workAt);
  return step('goWork', 'go', workAt);
}
