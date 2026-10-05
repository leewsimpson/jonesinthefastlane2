/**
 * The utility scorer (simulator §3, FR-80): one scorer, many personas. It values a player's position as weighted goal
 * progress plus what the persona expects over its horizon (pay from a job, rent, interest, a course nearly done,
 * weekly buffs), and scores each option by how much that value grows per hour spent. Travel is scored by the best
 * thing to do on arrival. Jones (Phase 3) and the simulator's bots share it. It plays by the rules: it only sees
 * the state a player could see and the previews every player gets (FR-80, FR-83).
 */
import type { GameContent } from '@fastlane/content';
import { GOAL_KEYS, type GoalKey, SAVINGS_ID } from '@fastlane/content/keys';
import type { Persona } from '@fastlane/content/sim';
import { HANDLERS } from '../actions/handlers.ts';
import { localActions, paramsOf, playerById, restBonusEnergy } from '../actions/plan.ts';
import { clone } from '../core/clone.ts';
import type { PlayerCtx } from '../core/context.ts';
import { price } from '../economy/prices.ts';
import { goalValues, rawProgressBp, wellbeing } from '../goals/goals.ts';
import { nextOnLadder, shiftPay, weeklyCap } from '../jobs/jobs.ts';
import { applyBp, applyPpm, BP_ONE, clamp } from '../math/fixed.ts';
import type { Rng } from '../rng/rng.ts';
import type { Action, Preview } from '../types/actions.ts';
import type { GameState, PlayerState } from '../types/state.ts';
import type { AiPolicy } from './random.ts';

export type { Persona } from '@fastlane/content/sim';

/** Ongoing weekly buffs are valued over at most this many weeks, so a gadget isn't worth a fortune. */
const BUFF_WEEKS = 4;
/** Energy below this costs value: work and study pay less and 0 ends the week (FR-21). */
const ENERGY_COMFORT = 30;
/** Future pay counts at half weight: jobs end, hours get cut (FR-42). */
const FUTURE_PAY_BP = 5000;
/** Goal progress stops adding value here. Above 100% so the bot keeps a margin and an overshoot (FR-11). */
const VALUE_CAP_BP = 12_500;
/** How many of the top moves a bot picks between when it doesn't take the best one. */
const RUNNERS_UP = 3;

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

/** What `player`'s position is worth to `persona`, in basis points of weighted goal progress. */
export function valuation(
  content: GameContent,
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  persona: Persona,
): number {
  const { balance, city } = content;
  const { world } = state;
  const horizon = persona.horizonWeeks;
  const values = goalValues(content, player);

  let wealth = values.wealth;
  if (player.job) {
    const weekly = shiftPay(
      content,
      world,
      player.job,
      Math.min(weeklyCap(content, player.job), 1800),
    );
    wealth += applyBp(weekly * horizon, FUTURE_PAY_BP);
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
  const weeks = Math.min(horizon, BUFF_WEEKS);
  const addWeekly = (deltas: Partial<Record<string, number>>) => {
    for (const key of ['happiness', 'health', 'social'] as const)
      stats[key] += (deltas[key] ?? 0) * weeks;
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
  if (meals === 0)
    for (const key of ['happiness', 'health', 'social'] as const)
      stats[key] += balance.hungerPenalty[key] ?? 0;
  for (const key of ['happiness', 'health', 'social'] as const)
    stats[key] = clamp(stats[key], 0, 100);

  // Half credit for the way to the next rung: experience done over experience needed (FR-43).
  let career = values.career;
  const job = player.job && city.jobs.find((j) => j.id === player.job?.id);
  const next = job && nextOnLadder(content, job);
  if (job && next && next.minExperience > 0) {
    const done = Math.min(
      BP_ONE,
      Math.floor(((player.experience[job.ladder] ?? 0) * BP_ONE) / next.minExperience),
    );
    const step = (next.level - job.level) * balance.goals.careerPointsPerLevel;
    career += applyBp(step, done / 2);
  }

  const projected: Record<GoalKey, number> = {
    wealth,
    wellbeing: wellbeing(content, { ...player, stats }),
    skills,
    career,
  };
  // Capped a little above 100%, so expected pay can't make a goal look done before it is; not floored at 0, so
  // debt below zero net worth still hurts.
  const progress = rawProgressBp(projected, state.config.goals);
  for (const key of GOAL_KEYS) progress[key] = Math.min(VALUE_CAP_BP, progress[key]);
  let value = 0;
  for (const key of GOAL_KEYS) value += applyBp(progress[key], persona.goalWeightsBp[key]);
  if (player.stats.energy < ENERGY_COMFORT) value -= (ENERGY_COMFORT - player.stats.energy) * 20;
  return value;
}

/** The player after `option`, worked out on a copy with average outcomes. Only `perform` and `travel` move. */
function project(
  content: GameContent,
  state: Readonly<GameState>,
  option: Preview & { available: true },
): PlayerState {
  const phase = state.phase;
  if (phase.kind !== 'turn') throw new Error('projections need a turn');
  const player = clone(playerById(state, phase.player));
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
  // The best thing to do on arrival at each place, worked out once per destination.
  const onArrival = new Map<string, { gain: number; minutes: number }>();
  const arrive = (option: Preview & { available: true }, to: string) => {
    let best = onArrival.get(to);
    if (!best) {
      best = { gain: 0, minutes: 0 };
      const there = withPlayer(state, project(content, state, option));
      const at = playerById(there, me.id);
      const base = valuation(content, there, at, persona);
      for (const local of localActions(content, there)) {
        if (!local.available) continue;
        const gain = valuation(content, there, project(content, there, local), persona) - base;
        if (perHour(gain, local.plan.time) > perHour(best.gain, best.minutes))
          best = { gain, minutes: local.plan.time };
      }
      onArrival.set(to, best);
    }
    return best;
  };

  const scored: ScoredOption[] = [];
  for (const option of options) {
    if (!option.available) continue;
    const { action, plan } = option;
    if (action.type === 'perform') {
      const gain = valuation(content, state, project(content, state, option), persona) - now;
      scored.push({ action, score: perHour(gain, plan.time) });
    } else if (action.type === 'travel') {
      const next = arrive(option, action.to);
      if (next.gain <= 0) {
        scored.push({ action, score: -1 });
        continue;
      }
      const trip = valuation(content, state, project(content, state, option), persona) - now;
      scored.push({ action, score: perHour(trip + next.gain, plan.time + next.minutes) });
    } else scored.push({ action, score: 0 });
  }
  return scored;
}

/** Best first; ties keep list order, so the choice never depends on sort stability. */
function ranked(scored: ScoredOption[]): ScoredOption[] {
  return scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map(({ s }) => s);
}

/**
 * A policy from a persona. It takes its top move `bestMoveRateBp` of the time, otherwise one of its top few that
 * still beat ending the week (FR-83: difficulty is how often it picks the best move, never bent rules).
 */
export function utilityPolicy(content: GameContent, persona: Persona): AiPolicy {
  return {
    chooseAction(options, rng, state) {
      const order = ranked(scoreOptions(content, state, options, persona));
      const best = order[0];
      const endWeek = options.find((o) => o.action.type === 'endWeek');
      if (!best || best.score <= 0) {
        if (!endWeek) throw new Error('End Week is always available');
        return endWeek.action;
      }
      if (rng.chance(persona.bestMoveRateBp)) return best.action;
      const runnersUp = order.slice(0, RUNNERS_UP).filter((s) => s.score > 0);
      return runnersUp[rng.int(0, runnersUp.length - 1)]?.action ?? best.action;
    },
    chooseOption: (decision, rng) =>
      decision.options[rng.int(0, decision.options.length - 1)] ?? '',
  };
}
