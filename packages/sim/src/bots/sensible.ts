/**
 * The scripted "sensible" strategy behind the Phase 2 exit criterion: a hand-written priority list a reasonable new
 * player might follow. Eat, get a job, dress and train for the next rung, work the hours, study with the time left,
 * keep friends, move out of the basement once it's affordable, pay down debt and save the rest. It is a test of the
 * rules and the balance, not a strong player.
 */
import { ANYWHERE, type Course, type GameContent, type Job, SAVINGS_ID } from '@fastlane/content';
import {
  type Action,
  type Engine,
  type GameState,
  type PlayerState,
  qualification,
  skillsValue,
} from '@fastlane/engine';
import type { Bot } from '../game.ts';

/** Cash kept back for food, travel and rent. */
const BUFFER = 40_000;
/** Cash kept on hand before saving the rest, so tuition and deposits stay affordable. */
const CUSHION = 250_000;
/** Minutes left unspent at the end of a week for social life and travel home. */
const RESERVE = 240;
/** Work minutes in a week with a course on, so study fits. */
const STUDY_WEEK_WORK = 1800;

const perform = (
  actionId: string,
  params: Omit<Extract<Action, { type: 'perform' }>, 'type' | 'actionId'> = {},
): Action => ({
  type: 'perform',
  actionId,
  ...params,
});

function me(state: GameState): PlayerState {
  const id = state.phase.kind === 'turn' ? state.phase.player : '';
  const p = state.players.find((q) => q.id === id);
  if (!p) throw new Error('no active player');
  return p;
}

/** The cheapest sensible way to get somewhere: walk short hops, take transit for longer ones. */
function tripTo(engine: Engine, state: GameState, to: string): Action | null {
  const walk = engine.preview(state, { type: 'travel', to, mode: 'walk' });
  const transit = engine.preview(state, { type: 'travel', to, mode: 'transit' });
  if (walk.available && walk.plan.time <= 60) return walk.action;
  if (transit.available) return transit.action;
  return walk.available ? walk.action : null;
}

/**
 * Do `action` at `location`: here if we're there, otherwise travel first, but only if it will still be possible
 * on arrival (checked on a copy of the state with the trip applied).
 */
function attempt(
  engine: Engine,
  state: GameState,
  location: string,
  action: Action,
): Action | null {
  const player = me(state);
  if (location === ANYWHERE || player.location === location)
    return engine.preview(state, action).available ? action : null;
  const trip = tripTo(engine, state, location);
  if (!trip) return null;
  const tripPlan = engine.preview(state, trip);
  if (!tripPlan.available) return null;
  const there = structuredClone(state);
  const moved = me(there);
  moved.location = location;
  moved.timeLeft -= tripPlan.plan.time;
  moved.stats.cash -= tripPlan.plan.money;
  return engine.preview(there, action).available ? trip : null;
}

const defAt = (content: GameContent, kind: string, location?: string) =>
  content.city.actions.find(
    (a) => a.kind === kind && (location === undefined || a.location === location),
  );

function nextJob(content: GameContent, player: PlayerState): Job | undefined {
  if (!player.job) return undefined;
  const job = content.city.jobs.find((j) => j.id === player.job?.id);
  return content.city.jobs.find(
    (j) => j.ladder === job?.ladder && j.level === (job?.level ?? 0) + 1,
  );
}

/** The course to take next: whatever the next rung needs, else the cheapest one that adds skills. */
function nextCourse(
  content: GameContent,
  state: GameState,
  player: PlayerState,
): Course | undefined {
  const untaken = content.city.courses.filter((c) => !player.credentials.includes(c.id));
  const needed = nextJob(content, player)?.requires.credentials ?? [];
  const forJob = untaken.find((c) => needed.includes(c.id));
  if (forJob) return forJob;
  if (skillsValue(content, player) >= state.config.goals.skills) return undefined;
  // Spread study across tracks: diminishing returns per track reward breadth (§3 Skills).
  const studied = new Set(
    player.credentials.map((id) => content.city.courses.find((c) => c.id === id)?.track),
  );
  return [...untaken]
    .filter((c) => c.type !== 'degree')
    .sort(
      (a, b) =>
        Number(studied.has(a.track)) - Number(studied.has(b.track)) || a.tuition - b.tuition,
    )[0];
}

function eat(engine: Engine, state: GameState, player: PlayerState): Action | null {
  if (player.mealsThisWeek >= 2) return null;
  const home = engine.content.city.board.home;
  const cook = defAt(engine.content, 'eat-stored');
  if (cook && player.pantryMeals > 0)
    return attempt(engine, state, cook.location, perform(cook.id));
  if (player.mealsThisWeek >= 1) return null;
  // Noodles cost health; when it runs low, a fresh meal is worth the trip.
  const fresh = engine.content.city.actions.find((a) => a.id === 'ready-meal');
  if (fresh && player.stats.health < 60) {
    const action = attempt(engine, state, fresh.location, perform(fresh.id));
    if (action) return action;
  }
  if (player.location === home) {
    const noodles = engine.content.city.actions.find(
      (a) => a.kind === 'eat' && a.location === home,
    );
    if (noodles) return attempt(engine, state, home, perform(noodles.id));
  }
  const meal = engine.content.city.actions.find(
    (a) => a.kind === 'eat' && a.location === player.location,
  );
  return meal ? attempt(engine, state, meal.location, perform(meal.id)) : null;
}

function findWork(engine: Engine, state: GameState, player: PlayerState): Action | null {
  if (player.job) return null;
  const apply = defAt(engine.content, 'apply-job');
  if (!apply) return null;
  const jobs = [...engine.content.city.jobs]
    .filter((j) => state.world.openings.includes(j.id) && !qualification(engine.content, player, j))
    .sort((a, b) => b.wage - a.wage);
  for (const job of jobs) {
    const action = attempt(engine, state, apply.location, perform(apply.id, { target: job.id }));
    if (action) return action;
  }
  return null;
}

function dressUp(engine: Engine, state: GameState, player: PlayerState): Action | null {
  const next = nextJob(engine.content, player);
  if (!next || player.stats.wardrobe >= next.dressTier) return null;
  const clothes = engine.content.city.items
    .filter((i) => (i.wardrobeTier ?? -1) >= next.dressTier)
    .sort((a, b) => a.price - b.price)[0];
  if (!clothes || player.stats.cash < clothes.price + BUFFER) return null;
  const shop = engine.content.city.actions.find(
    (a) => a.kind === 'buy' && a.location === clothes.shop,
  );
  return shop
    ? attempt(engine, state, shop.location, perform(shop.id, { target: clothes.id }))
    : null;
}

function enroll(engine: Engine, state: GameState, player: PlayerState): Action | null {
  if (player.enrollment) return null;
  const course = nextCourse(engine.content, state, player);
  if (!course) return null;
  const cash = engine.content.city.actions.find((a) => a.kind === 'enroll' && !a.loan);
  const loan = engine.content.city.actions.find((a) => a.kind === 'enroll' && a.loan);
  if (cash && player.stats.cash >= course.tuition + BUFFER)
    return attempt(engine, state, cash.location, perform(cash.id, { target: course.id }));
  if (loan && course.loanEligible)
    return attempt(engine, state, loan.location, perform(loan.id, { target: course.id }));
  return null;
}

/** Energy kept in hand: below the low-energy threshold work and study pay less (FR-21), and at 0 the week ends. */
const ENERGY_FLOOR = 30;

/** The energy an action would cost, from its preview. */
function energyCost(engine: Engine, state: GameState, action: Action): number {
  const preview = engine.preview(state, action);
  const plan = preview.plan;
  if (!plan) return 0;
  return -plan.effects.filter((e) => e.stat === 'energy').reduce((sum, e) => sum + e.delta, 0);
}

/**
 * The longest duration that fits the week (leaving `reserve` minutes), stays within `most` minutes, and keeps
 * energy above the floor.
 */
function longest(
  engine: Engine,
  state: GameState,
  location: string,
  actionId: string,
  reserve: number,
  most = Number.POSITIVE_INFINITY,
): Action | null {
  const def = engine.content.city.actions.find((a) => a.id === actionId);
  const player = me(state);
  for (const minutes of [...(def?.durations ?? [])].sort((a, b) => b - a)) {
    if (player.timeLeft - minutes < reserve || minutes > most) continue;
    const act = perform(actionId, { minutes });
    if (player.stats.energy - energyCost(engine, state, act) < ENERGY_FLOOR) continue;
    const action = attempt(engine, state, location, act);
    if (action) return action;
  }
  return null;
}

function work(engine: Engine, state: GameState, player: PlayerState): Action | null {
  const job = engine.content.city.jobs.find((j) => j.id === player.job?.id);
  if (!job) return null;
  const shift = engine.content.city.actions.find(
    (a) => a.kind === 'work-shift' && a.location === job.location,
  );
  // While studying, leave time and energy for it: work at most STUDY_WEEK_WORK minutes.
  const most = player.enrollment ? STUDY_WEEK_WORK - (player.job?.minutesThisWeek ?? 0) : undefined;
  return shift ? longest(engine, state, job.location, shift.id, 0, most) : null;
}

function study(engine: Engine, state: GameState, player: PlayerState): Action | null {
  if (!player.enrollment) return null;
  const campus = engine.content.city.actions.find((a) => a.kind === 'study' && !a.requires?.item);
  return campus ? longest(engine, state, campus.location, campus.id, RESERVE) : null;
}

function socialise(engine: Engine, state: GameState, player: PlayerState): Action | null {
  const { happiness, social } = player.stats;
  if (Math.min(happiness, social) >= 75 || player.stats.cash < BUFFER / 4) return null;
  const host = engine.content.city.actions.find((a) => a.id === 'host-friends');
  const hangOut = engine.content.city.actions.find((a) => a.id === 'hang-out');
  for (const def of [host, hangOut])
    if (def) {
      const action = attempt(engine, state, def.location, perform(def.id));
      if (action) return action;
    }
  return null;
}

/** Move out of the basement when the deposit and a cushion are covered. */
function moveOut(engine: Engine, state: GameState, player: PlayerState): Action | null {
  const tiers = engine.content.city.housing;
  if (player.housing.tier !== tiers[0]?.id) return null;
  const next = tiers[1];
  const lease = defAt(engine.content, 'rent-home');
  if (!next || !lease || player.stats.cash < next.deposit + BUFFER * 2) return null;
  return attempt(engine, state, lease.location, perform(lease.id, { target: next.id }));
}

/** Kit that pays for itself: a fridge for cheaper, healthier meals; then groceries to fill it. */
function shop(engine: Engine, state: GameState, player: PlayerState): Action | null {
  const items = engine.content.city.items;
  const fridge = items.find((i) => i.id === 'fridge');
  const groceries = items.find((i) => i.requiresItem === 'fridge');
  const buyAt = (itemId: string, shopLocation: string) => {
    const def = engine.content.city.actions.find(
      (a) => a.kind === 'buy' && a.location === shopLocation,
    );
    return def ? attempt(engine, state, shopLocation, perform(def.id, { target: itemId })) : null;
  };
  if (fridge && !player.items.includes(fridge.id) && player.stats.cash >= fridge.price + BUFFER)
    return buyAt(fridge.id, fridge.shop);
  if (
    groceries &&
    player.items.includes('fridge') &&
    player.pantryMeals < 2 &&
    player.stats.cash >= BUFFER
  )
    return buyAt(groceries.id, groceries.shop);
  return null;
}

/** Pay off debt above the buffer, then save the rest. */
function bank(engine: Engine, state: GameState, player: PlayerState): Action | null {
  const spare = player.stats.cash - CUSHION;
  if (spare < 20_000) return null;
  const repay = defAt(engine.content, 'repay');
  const deposit = defAt(engine.content, 'deposit');
  for (const kind of ['arrears', 'card', 'student'] as const) {
    const owed = player.debts[kind].balance;
    if (repay && owed > 0)
      return attempt(
        engine,
        state,
        repay.location,
        perform(repay.id, { target: kind, amount: Math.min(owed, spare) }),
      );
  }
  return deposit
    ? attempt(
        engine,
        state,
        deposit.location,
        perform(deposit.id, { target: SAVINGS_ID, amount: spare }),
      )
    : null;
}

export const sensibleBot: Bot = {
  id: 'sensible',
  choose(engine, state) {
    const pending = state.pending;
    if (pending)
      return { type: 'decide', decisionId: pending.id, optionId: pending.options[0] ?? '' };
    const player = me(state);
    const steps = [eat, findWork, dressUp, enroll, shop, work, study, socialise, moveOut, bank];
    for (const step of steps) {
      const action = step(engine, state, player);
      if (action) return action;
    }
    return { type: 'endWeek' };
  },
};
