/**
 * The week guide (ENG-20, FR-03): what the player still needs this week, and one suggested next step. The original
 * game left players to discover hunger and rent the hard way; here the board's centre says it before the week ends.
 * Pure: reads the state and content, never changes them.
 */

import type { GameContent } from '@fastlane/content';
import { ANYWHERE } from '@fastlane/content/keys';
import {
  type Action,
  type GameState,
  type PlayerState,
  type Preview,
  weeklyCap,
} from '@fastlane/engine';

export interface WeekNeeds {
  /** Meals eaten or delivered this week; 0 means the food check will bite. */
  meals: number;
  /** Rent the bills step takes at the end of this week, in cents. */
  rentDue: number;
  /** How much of `rentDue` cash doesn't cover. */
  rentShort: number;
  /** The job's location and the work minutes left under its weekly cap, or null without a job. */
  work: { location: string; minutesLeft: number; remote: boolean } | null;
}

export function weekNeeds(content: GameContent, state: GameState, player: PlayerState): WeekNeeds {
  let meals = player.mealsThisWeek;
  for (const sub of content.city.subscriptions)
    if (player.subscriptions.includes(sub.id)) meals += sub.meals ?? 0;
  const rentDue = player.housing.rent * state.config.turnLengthWeeks;
  let work: WeekNeeds['work'] = null;
  if (player.job) {
    const job = content.city.jobs.find((j) => j.id === player.job?.id);
    if (job)
      work = {
        location: job.location,
        minutesLeft: Math.max(0, weeklyCap(content, player.job) - player.job.minutesThisWeek),
        remote: job.remote,
      };
  }
  return { meals, rentDue, rentShort: Math.max(0, rentDue - player.stats.cash), work };
}

/** Stops from `from` to `to` the shorter way round the loop. */
function stops(content: GameContent, from: string, to: string): number {
  const ids = content.city.board.locations.map((l) => l.id);
  const n = ids.length;
  const d = (((ids.indexOf(to) - ids.indexOf(from)) % n) + n) % n;
  return Math.min(d, n - d);
}

/** Places where a meal can be bought outright (not the fridge, which needs groceries first), nearest first. */
export function mealPlaces(content: GameContent, from: string): string[] {
  const places = new Set<string>();
  for (const a of content.city.actions)
    if (a.kind === 'eat' && a.location !== ANYWHERE) places.add(a.location);
  return [...places].sort((a, b) => stops(content, from, a) - stops(content, from, b));
}

/** The board location that offers an action kind (the job board, the college), or null. */
function placeOf(content: GameContent, kind: string): string | null {
  return (
    content.city.actions.find((a) => a.kind === kind && a.location !== ANYWHERE)?.location ?? null
  );
}

export type HintId =
  | 'timeUp'
  | 'findJob'
  | 'pickJob'
  | 'eatHere'
  | 'eatAt'
  | 'workHere'
  | 'workAt'
  | 'rest'
  | 'rentShort'
  | 'studyHere'
  | 'studyAt'
  | 'enrol'
  | 'endWeek';

export interface Hint {
  id: HintId;
  /** Where to go next, if somewhere else. */
  dest: string | null;
  /** Values for the hint's copy. Locations are ids; the UI names them. */
  params: Record<string, string | number>;
}

/** Below this much Energy, work and study suffer (balance `statModifiers`), so the guide suggests rest. */
const TIRED = 20;
/** Minutes a short shift or a cheap meal needs; less than this left and the week is done. */
const MIN_USEFUL = 30;
/** With this little time left and no meal yet, eating comes before anything else. */
const HUNGRY_BY = 12 * 60;

/**
 * One next step, most urgent first: a job, a meal, a shift, rent, study, then rest. `canEatHere` and `canStudyHere`
 * come from the engine's own previews, so the guide never suggests something the rules would refuse.
 */
export function nextHint(
  content: GameContent,
  state: GameState,
  player: PlayerState,
  here: { canEat: boolean; canStudy: boolean },
): Hint {
  const at = player.location;
  const needs = weekNeeds(content, state, player);
  const hint = (id: HintId, dest: string | null = null, params: Hint['params'] = {}): Hint => ({
    id,
    dest: dest === at ? null : dest,
    params,
  });

  if (player.timeLeft < MIN_USEFUL) return hint('timeUp');
  if (!needs.work) {
    const jobs = placeOf(content, 'apply-job');
    return at === jobs ? hint('pickJob') : hint('findJob', jobs, { location: jobs ?? at });
  }
  const hungry = needs.meals === 0;
  const [nearestMeal] = mealPlaces(content, at);
  const eat = () =>
    here.canEat
      ? hint('eatHere')
      : hint('eatAt', nearestMeal ?? null, { location: nearestMeal ?? at });
  // A meal can wait for a shift, but not past the point where the week might end without one.
  if (hungry && (here.canEat || player.timeLeft <= HUNGRY_BY)) return eat();
  if (player.stats.energy < TIRED) return hint('rest', content.city.board.home);
  const { work } = needs;
  if (work.minutesLeft >= 60) {
    const where = work.remote && at === content.city.board.home ? at : work.location;
    return where === at
      ? hint('workHere', null, { hours: Math.floor(work.minutesLeft / 60) })
      : hint('workAt', where, { location: where, hours: Math.floor(work.minutesLeft / 60) });
  }
  if (hungry) return eat();
  if (needs.rentShort > 0) return hint('rentShort', null, { short: needs.rentShort });
  const college = placeOf(content, 'enroll');
  if (player.enrollment) {
    if (here.canStudy) return hint('studyHere');
    if (college) return hint('studyAt', college, { location: college });
  }
  if (college && !player.enrollment && player.credentials.length === 0)
    return hint('enrol', college, { location: college });
  return hint('endWeek');
}

/** A trip that can go now. */
export type TravelPreview = Extract<Preview, { available: true }> & {
  action: Extract<Action, { type: 'travel' }>;
};

/**
 * The trip a click on the board takes (FR-02): the player's chosen transport mode when it can go, otherwise the
 * cheapest mode that can, then the quickest. Null when no mode can reach `dest` (the travel dialog says why).
 */
export function pickTrip(
  previews: readonly Preview[],
  dest: string,
  mode: string,
): TravelPreview | null {
  const trips = previews.filter(
    (p): p is TravelPreview => p.action.type === 'travel' && p.action.to === dest && p.available,
  );
  const chosen = trips.find((p) => p.action.mode === mode);
  if (chosen) return chosen;
  const cost = (p: TravelPreview) => [p.plan.money, p.plan.time] as const;
  return (
    [...trips].sort((a, b) => {
      const [am, at] = cost(a);
      const [bm, bt] = cost(b);
      return am - bm || at - bt;
    })[0] ?? null
  );
}
