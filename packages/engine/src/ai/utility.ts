/**
 * The utility scorer (simulator §3, FR-80): one scorer, many personas. It values a player's position as weighted goal
 * progress plus what the persona expects over its horizon (pay from a job it will keep, rent, interest, a course
 * nearly done, readiness for the next rung, weekly buffs), and scores each option by how much that value grows per
 * hour spent. Travel is scored by the best thing to do on arrival. Jones and the simulator's bots share it. It plays
 * by the rules: it only sees the state a player could see and the previews every player gets (FR-80, FR-83).
 *
 * Goal value is concave: progress past a target is worth `overshootBp` as much, and the weakest goal earns an extra
 * `bottleneckBp`, because winning needs all four (FR-11). Tuning lives in `content.ai.utility` (NFR-15).
 */
import type { GameContent, Job, Persona } from '@fastlane/content';
import { GOAL_KEYS, type GoalKey, SAVINGS_ID } from '@fastlane/content/keys';
import { HANDLERS } from '../actions/handlers.ts';
import {
  localActions,
  paramsOf,
  playerById,
  previewAction,
  restBonusEnergy,
} from '../actions/plan.ts';
import type { PlayerCtx } from '../core/context.ts';
import { price, wage } from '../economy/prices.ts';
import { goalValues, wellbeing } from '../goals/goals.ts';
import {
  effectiveExposure,
  jobById,
  nextOnLadder,
  qualification,
  shiftPay,
  weeklyCap,
} from '../jobs/jobs.ts';
import { applyBp, applyPpm, BP_ONE, clamp } from '../math/fixed.ts';
import type { Rng } from '../rng/rng.ts';
import type { Action, Preview } from '../types/actions.ts';
import type { ChoicePlan, Decision, GameState, JobState, PlayerState } from '../types/state.ts';
import type { AiPolicy } from './random.ts';

export type { Persona } from '@fastlane/content';

/** The average outcome, so projections don't consume real randomness (previews never do). */
const EXPECTED: Rng = {
  int: (min, max) => Math.floor((min + max) / 2),
  chance: (bp) => bp >= BP_ONE / 2,
  pick(items) {
    let best = items[0];
    for (const item of items) if (best === undefined || item.weight > best.weight) best = item;
    if (!best) throw new Error('nothing to pick');
    return best.value;
  },
};

/** A job the player will still have after this week's job check: no layoff coming, not about to be let go. */
/**
 * The job the player will hold after this week's job check, by the published rules (FR-42, FR-43): none if a layoff
 * is coming or a week with no shifts would drop the rating to 0, the next rung if the player qualifies, is rated
 * high enough and has worked this week, otherwise the job they have.
 */
function jobAfterCheck(content: GameContent, player: Readonly<PlayerState>): JobState | null {
  const job = player.job;
  const rules = content.balance.jobs;
  if (!job || job.layoffWarning) return null;
  if (job.minutesThisWeek === 0) return job.rating <= rules.noShowPenalty ? null : job;
  const next = nextOnLadder(content, jobById(content, job.id));
  if (next && job.rating >= rules.promotionRating && !qualification(content, player, next))
    return { ...job, id: next.id, wageBp: BP_ONE, hoursCapBp: BP_ONE, rating: rules.ratingStart };
  return job;
}

/** Career points a job would give this player (§3 Career). */
function careerPoints(content: GameContent, player: Readonly<PlayerState>, job: Job): number {
  const { careerPointsPerLevel, stabilityExposureBp } = content.balance.goals;
  const stability = BP_ONE - applyBp(effectiveExposure(content, player, job), stabilityExposureBp);
  return applyBp(job.level * careerPointsPerLevel, stability);
}

/**
 * Roughly how many minutes of focused effort stand between the player and `next`: experience on the ladder, the
 * courses and skill hours it needs, a shopping trip for clothes, and the hours to lift the rating (FR-43).
 */
function minutesToRung(content: GameContent, player: Readonly<PlayerState>, next: Job): number {
  const { balance, city } = content;
  let left = Math.max(0, next.minExperience - (player.experience[next.ladder] ?? 0));
  // Enrolled in a course the rung doesn't need, while it needs study: dropping it is a step.
  const studying = player.enrollment?.course;
  const studyNeeded =
    next.requires.credentials.some((id) => !player.credentials.includes(id)) ||
    Object.keys(next.requires.skills).length > 0;
  const tracksNeeded = Object.keys(next.requires.skills);
  const course = studying ? city.courses.find((c) => c.id === studying) : undefined;
  if (
    course &&
    studyNeeded &&
    !next.requires.credentials.includes(course.id) &&
    !tracksNeeded.includes(course.track)
  )
    left += 15;
  for (const id of next.requires.credentials) {
    if (player.credentials.includes(id)) continue;
    const course = city.courses.find((c) => c.id === id);
    const done = player.enrollment?.course === id ? player.enrollment.minutes : -60;
    left += Math.max(0, (course?.studyMinutes ?? 0) - done);
  }
  for (const [track, points] of Object.entries(next.requires.skills)) {
    const need = Math.ceil((points * points * 60) / balance.skills.pointsScale);
    const missing = need - (player.trackMinutes[track] ?? 0);
    if (missing <= 0) continue;
    // Skill hours come from study, which needs a course on the track: enrolling is a step too.
    const course =
      player.enrollment && city.courses.find((c) => c.id === player.enrollment?.course);
    left += missing + (course?.track === track ? 0 : 60);
  }
  if (player.stats.wardrobe < next.dressTier) left += 60;
  const rating = player.job?.rating ?? 0;
  if (rating < balance.jobs.promotionRating && balance.jobs.ratingPerHour > 0)
    left += Math.ceil(((balance.jobs.promotionRating - rating) * 60) / balance.jobs.ratingPerHour);
  return left;
}

/**
 * The next rung of the current ladder, and how much of it the bot counts already: patience ÷ (patience + effort
 * still to go), in basis points, where patience is `patienceWeeks` of full-time effort. Every hour of experience,
 * study or rating shortens the wait, so it all has value, and the last hours count most: a promotion that only waits
 * on the job check counts in full (FR-41, FR-43). Only the current ladder counts, so the bot doesn't hop between
 * entry jobs and throw that progress away.
 */
function outlook(
  content: GameContent,
  player: Readonly<PlayerState>,
  current: Job,
): { next: Job; shareBp: number } | null {
  const next = nextOnLadder(content, current);
  if (!next) return null;
  const minutes = minutesToRung(content, player, next);
  const patience = content.ai.utility.patienceWeeks * content.balance.jobs.maxWeeklyMinutes;
  const shareBp = Math.floor((patience * BP_ONE) / (patience + minutes));
  return { next, shareBp };
}

/** What `player`'s position is worth to `persona`, in parts per million of weighted goal progress. */
export function valuation(
  content: GameContent,
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  persona: Persona,
): number {
  const { balance, city } = content;
  const tuning = content.ai.utility;
  const { world } = state;
  const horizon = persona.horizonWeeks;
  const values = goalValues(content, player);
  const job = jobAfterCheck(content, player);

  let wealth =
    values.wealth + applyBp(Math.min(player.stats.cash, tuning.cashCushion), tuning.liquidityBp);
  const current = job ? jobById(content, job.id) : null;
  const ahead = job && current ? outlook(content, player, current) : null;
  if (job) {
    const hours = Math.min(weeklyCap(content, job), 1800);
    let weekly = shiftPay(content, world, job, hours);
    // The next rung's pay rise, as far as the outlook counts it.
    if (ahead) {
      const raise = shiftPay(content, world, { ...job, id: ahead.next.id }, hours) - weekly;
      weekly += applyBp(Math.max(0, raise), ahead.shareBp);
    }
    wealth += applyBp(weekly * horizon, tuning.futurePayBp);
  }
  wealth -= player.housing.rent * horizon;
  for (const sub of city.subscriptions)
    if (player.subscriptions.includes(sub.id)) wealth -= price(world, sub.weeklyCost) * horizon;
  wealth += applyPpm(player.holdings[SAVINGS_ID] ?? 0, balance.finance.savingsWeeklyPpm * horizon);
  wealth -= applyPpm(player.debts.card.balance, balance.finance.card.weeklyPpm * horizon);
  wealth -= applyPpm(player.debts.student.balance, balance.finance.studentWeeklyPpm * horizon);
  const riskBp = Math.floor(((persona.riskAppetiteBp - BP_ONE / 2) * horizon) / 52);
  for (const asset of balance.market.assets)
    wealth += applyBp(player.holdings[asset.id] ?? 0, riskBp);

  let skills = values.skills;
  if (player.enrollment) {
    const course = city.courses.find((c) => c.id === player.enrollment?.course);
    if (course) {
      const done = Math.min(
        BP_ONE,
        Math.floor((player.enrollment.minutes * BP_ONE) / course.studyMinutes),
      );
      skills += applyBp(course.credentialPoints, BP_ONE / 2 + done / 2);
    }
  }

  // Wellbeing a few weeks out: weekly buffs from home, items and subscriptions, and this week's hunger.
  const stats = { ...player.stats };
  const weeks = Math.min(horizon, tuning.buffWeeks);
  const addWeekly = (deltas: Partial<Record<string, number>>) => {
    stats.happiness += (deltas.happiness ?? 0) * weeks;
    stats.health += (deltas.health ?? 0) * weeks;
    stats.social += (deltas.social ?? 0) * weeks;
  };
  const home = city.housing.find((h) => h.id === player.housing.tier);
  if (home) addWeekly(home.weekly);
  for (const item of city.items) if (player.items.includes(item.id)) addWeekly(item.weekly);
  let meals = player.mealsThisWeek;
  for (const sub of city.subscriptions)
    if (player.subscriptions.includes(sub.id)) {
      addWeekly(sub.weekly);
      meals += sub.meals ?? 0;
    }
  if (meals === 0) {
    stats.happiness += balance.hungerPenalty.happiness ?? 0;
    stats.health += balance.hungerPenalty.health ?? 0;
    stats.social += balance.hungerPenalty.social ?? 0;
  }
  stats.happiness = clamp(stats.happiness, 0, 100);
  stats.health = clamp(stats.health, 0, 100);
  stats.social = clamp(stats.social, 0, 100);

  let career = 0;
  if (job && current) {
    career = careerPoints(content, player, current);
    if (ahead) {
      const step =
        careerPoints(content, player, ahead.next) - careerPoints(content, player, current);
      career += applyBp(applyBp(Math.max(0, step), ahead.shareBp), tuning.aspirationBp);
    }
  }

  // Where the goals stand now, and where the persona expects them over its horizon.
  // Career as it will stand after this week's job check.
  const actual: Record<GoalKey, number> = {
    ...values,
    career: current ? careerPoints(content, player, current) : 0,
  };
  const projected: Record<GoalKey, number> = {
    wealth,
    wellbeing: wellbeing(content, { ...player, stats }),
    skills,
    career,
  };
  // Progress in parts per million of each target: basis points are too coarse to tell an hour of work from an hour
  // of gigs once divided per hour. The concave curve applies to progress already made, so expected pay can't make
  // a goal look done before it is; prospects add linearly at `prospectBp`.
  const { goals } = state.config;
  const cap = tuning.valueCapBp * 100;
  const ppm = (v: number, key: GoalKey) => Math.floor((v * PPM_ONE) / goals[key]);
  let value = 0;
  let weakest = Number.POSITIVE_INFINITY;
  for (const key of GOAL_KEYS) {
    // Not floored at 0, so debt below zero net worth still hurts.
    const p = Math.min(cap, ppm(actual[key], key));
    const g = curve(p, tuning.overshootBp);
    // Prospects past the target count at the overshoot rate too, so a bot stops chasing a goal that's done.
    const q = Math.min(cap, ppm(projected[key], key));
    const prospect = applyBp(curve(q, tuning.overshootBp) - g, tuning.prospectBp);
    value += applyBp(g + prospect, persona.goalWeightsBp[key]);
    // The lagging goal, counting progress on the way: every step toward it earns the bottleneck bonus.
    weakest = Math.min(weakest, Math.min(p + prospect, PPM_ONE));
  }
  value += applyBp(weakest, persona.bottleneckBp);
  if (player.stats.energy < tuning.energyComfort)
    value -= (tuning.energyComfort - player.stats.energy) * tuning.energyPenalty;
  return value;
}

/** Valuations are in parts per million of a goal's target. */
const PPM_ONE = 1_000_000;

/** Concave goal value: full slope up to the target, `overshootBp` of it beyond. */
const curve = (p: number, overshootBp: number) =>
  p <= PPM_ONE ? p : PPM_ONE + applyBp(p - PPM_ONE, overshootBp);

/** A copy of a player, faster than a generic deep clone. Only for projections, which never outlive the call. */
function copyPlayer(p: Readonly<PlayerState>): PlayerState {
  return {
    ...p,
    stats: { ...p.stats },
    items: [...p.items],
    job: p.job ? { ...p.job } : null,
    experience: { ...p.experience },
    enrollment: p.enrollment ? { ...p.enrollment } : null,
    credentials: [...p.credentials],
    trackMinutes: { ...p.trackMinutes },
    housing: { ...p.housing },
    holdings: { ...p.holdings },
    debts: {
      card: { ...p.debts.card },
      student: { ...p.debts.student },
      arrears: { ...p.debts.arrears },
    },
    subscriptions: [...p.subscriptions],
  };
}

/** The player after `option`, worked out on a copy with average outcomes. Only `perform` and `travel` move. */
function project(
  content: GameContent,
  state: Readonly<GameState>,
  option: Preview & { available: true },
): PlayerState {
  const phase = state.phase;
  if (phase.kind !== 'turn') throw new Error('projections need a turn');
  const player = copyPlayer(playerById(state, phase.player));
  const { action, plan } = option;
  if (action.type === 'travel') {
    player.location = action.to;
    player.timeLeft -= plan.time;
    player.stats.cash -= plan.money;
    for (const e of plan.effects) if (e.stat === 'energy') player.stats.energy += e.delta;
  } else if (action.type === 'perform') {
    const def = content.city.actions.find((a) => a.id === action.actionId);
    if (!def) throw new Error(`unknown action ${action.actionId}`);
    const ctx: PlayerCtx = {
      content,
      emit: () => {},
      week: state.week,
      config: state.config,
      player,
      world: state.world,
      rng: () => EXPECTED,
      newId: (prefix) => `${prefix}-projected`,
    };
    HANDLERS[def.kind].apply(ctx, def, plan, paramsOf(action));
  } else if (action.type === 'endWeek') {
    player.stats.energy = Math.min(
      100,
      player.stats.energy + restBonusEnergy(content, player.timeLeft),
    );
  }
  return player;
}

/** The state as it would look with the active player replaced. Shallow: only for previews and valuation. */
function withPlayer(state: Readonly<GameState>, player: PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player.id ? player : p)) };
}

/** Value gained per hour, so a short good action beats a long slightly better one. */
const perHour = (gain: number, minutes: number) => Math.floor((gain * 60) / Math.max(15, minutes));

export interface ScoredOption {
  action: Action;
  score: number;
}

/** Score every available option for the active player. End Week scores 0: anything worth doing scores above it. */
export function scoreOptions(
  content: GameContent,
  state: Readonly<GameState>,
  options: readonly Preview[],
  persona: Persona,
): ScoredOption[] {
  const phase = state.phase;
  if (phase.kind !== 'turn') throw new Error('scoring needs a turn');
  const me = playerById(state, phase.player);
  const now = valuation(content, state, me, persona);
  // The best thing to do on arrival at each place, picked once per destination from the first way there. Each trip
  // is then valued from its own arrival state, so a walk's energy cost isn't credited to a rideshare.
  const bestThere = new Map<string, Action | null>();
  const arrive = (there: GameState, to: string): Action | null => {
    if (bestThere.has(to)) return bestThere.get(to) ?? null;
    const at = playerById(there, me.id);
    const base = valuation(content, there, at, persona);
    let best: { action: Action; score: number } | null = null;
    for (const local of localActions(content, there)) {
      if (!local.available) continue;
      const gain = valuation(content, there, project(content, there, local), persona) - base;
      const score = perHour(gain, local.plan.time);
      if (gain > 0 && (!best || score > best.score)) best = { action: local.action, score };
    }
    bestThere.set(to, best?.action ?? null);
    return best?.action ?? null;
  };

  const scored: ScoredOption[] = [];
  for (const option of options) {
    if (!option.available) continue;
    const { action, plan } = option;
    if (action.type === 'perform') {
      const gain = valuation(content, state, project(content, state, option), persona) - now;
      scored.push({ action, score: perHour(gain, plan.time) });
    } else if (action.type === 'travel') {
      const there = withPlayer(state, project(content, state, option));
      const next = arrive(there, action.to);
      const then = next && previewAction(content, there, next);
      if (!then?.available) {
        scored.push({ action, score: -1 });
        continue;
      }
      const gain = valuation(content, there, project(content, there, then), persona) - now;
      scored.push({ action, score: gain > 0 ? perHour(gain, plan.time + then.plan.time) : -1 });
    } else scored.push({ action, score: 0 });
  }
  return scored;
}

/** Best first; ties keep list order, so the choice never depends on sort stability. */
function ranked<T extends { score: number }>(scored: T[]): T[] {
  return scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map(({ s }) => s);
}

/** Same action and target, different length. */
const sameAction = (a: Action, b: Action) =>
  a.type === 'perform' &&
  b.type === 'perform' &&
  a.actionId === b.actionId &&
  a.target === b.target &&
  a.amount === b.amount;

/**
 * The longest version of `best` that scores within `longerSlackBp` of it, so a bot works one long shift rather than
 * many short ones. Fewer, longer actions are also how a person plays (ENG-02).
 */
function longest(order: ScoredOption[], best: ScoredOption, slackBp: number): Action {
  if (best.action.type !== 'perform' || best.action.minutes === undefined) return best.action;
  const floor = best.score - applyBp(Math.abs(best.score), slackBp);
  let pick = best.action;
  for (const s of order)
    if (
      s.score >= floor &&
      sameAction(s.action, pick) &&
      s.action.type === 'perform' &&
      (s.action.minutes ?? 0) > (pick.type === 'perform' ? (pick.minutes ?? 0) : 0)
    )
      pick = s.action;
  return pick;
}

/** Pick the top move `bestMoveRateBp` of the time, otherwise one of the top few that still beat doing nothing. */
function choose<T extends { score: number }>(
  order: T[],
  persona: Persona,
  runnersUp: number,
  rng: Rng,
): T | undefined {
  const best = order[0];
  if (!best || rng.chance(persona.bestMoveRateBp)) return best;
  const good = order.slice(0, runnersUp).filter((s) => s.score > 0);
  return good[rng.int(0, good.length - 1)] ?? best;
}

/**
 * A choice's value: the player after its cost, effects and outcomes, with outcomes taken at a point in their range
 * set by risk appetite (a gambler expects the top end). Time next week counts at the player's hourly pay, and a
 * layoff warning as losing the job.
 */
function choiceValue(
  content: GameContent,
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  plan: ChoicePlan,
  persona: Persona,
): number {
  const p = copyPlayer(player);
  p.stats.cash -= plan.money;
  const add = (stat: keyof PlayerState['stats'], delta: number) => {
    if (stat === 'cash') p.stats.cash += delta;
    else {
      const range = content.balance.statRanges[stat];
      p.stats[stat] = clamp(p.stats[stat] + delta, range.min, range.max ?? Number.MAX_SAFE_INTEGER);
    }
  };
  for (const e of plan.effects) add(e.stat, e.delta);
  for (const o of plan.outcomes)
    add(o.stat, o.min + applyBp(o.max - o.min, persona.riskAppetiteBp));
  const hourly = player.job
    ? shiftPay(content, state.world, player.job, 60)
    : wage(state.world, content.city.gigPayPerHour.min);
  p.stats.cash = Math.max(0, p.stats.cash + Math.floor((plan.nextWeekMinutes * hourly) / 60));
  if (p.job) {
    p.job.rating = clamp(p.job.rating + plan.jobRating, 0, 100);
    if (plan.layoffWarning) p.job.layoffWarning = true;
  }
  return valuation(content, withPlayer(state, p), p, persona);
}

/** Score each option of a pending decision for the player who must make it. */
export function scoreChoices(
  content: GameContent,
  state: Readonly<GameState>,
  decision: Decision,
  persona: Persona,
): { option: string; score: number }[] {
  const player = playerById(state, decision.player);
  return decision.options.map((option) => {
    const plan = decision.plans[option];
    return { option, score: plan ? choiceValue(content, state, player, plan, persona) : 0 };
  });
}

/**
 * A policy from a persona. It takes its top move `bestMoveRateBp` of the time, otherwise one of its top few that
 * still beat ending the week (FR-83: difficulty is how often it picks the best move, never bent rules).
 */
export function utilityPolicy(content: GameContent, persona: Persona): AiPolicy {
  const { longerSlackBp } = content.ai.utility;
  const { runnersUp } = persona;
  return {
    chooseAction(options, rng, state) {
      const order = ranked(scoreOptions(content, state, options, persona));
      const endWeek = options.find((o) => o.action.type === 'endWeek');
      if (!endWeek) throw new Error('End Week is always available');
      const best = order[0];
      if (!best || best.score <= 0) return endWeek.action;
      const pick = choose(order, persona, runnersUp, rng) ?? best;
      return longest(order, pick, longerSlackBp);
    },
    chooseOption(decision, rng, state) {
      const order = ranked(scoreChoices(content, state, decision, persona));
      // Every option is a real choice here, so "beats doing nothing" doesn't apply: shift scores to be positive.
      const low = Math.min(...order.map((o) => o.score));
      const shifted = order.map((o) => ({ ...o, score: o.score - low + 1 }));
      const pick = choose(shifted, persona, runnersUp, rng);
      if (!pick) throw new Error('a decision has options');
      return pick.option;
    },
  };
}

/** Jones (FR-80): each AI seat plays its own persona from `content.ai.rivals` (FR-83). */
export function rivalPolicy(content: GameContent): AiPolicy {
  const policies = new Map(content.ai.rivals.map((p) => [p.id, utilityPolicy(content, p)]));
  const forPlayer = (state: Readonly<GameState>, id: string) => {
    const persona = playerById(state, id).persona;
    const policy = persona === null ? undefined : policies.get(persona);
    if (!policy) throw new Error(`no rival persona for ${id}`);
    return policy;
  };
  return {
    chooseAction(options, rng, state) {
      if (state.phase.kind !== 'turn') throw new Error('AI actions need a turn');
      return forPlayer(state, state.phase.player).chooseAction(options, rng, state);
    },
    chooseOption: (decision, rng, state) =>
      forPlayer(state, decision.player).chooseOption(decision, rng, state),
  };
}
