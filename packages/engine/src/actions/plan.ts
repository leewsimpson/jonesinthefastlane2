/**
 * Previews and the legal-action list (engine-design §8, FR-03). This is the single legality check: `reduce` refuses
 * anything `previewAction` marks unavailable, so the UI and the rules can't disagree.
 */
import type { GameContent, LocationAction } from '@fastlane/content';
import { ANYWHERE } from '@fastlane/content/keys';
import { loopDistance, travelCost } from '../board/board.ts';
import { price } from '../economy/prices.ts';
import { applyModifiers, collectModifiers } from '../stats/stats.ts';
import type { Action, PerformParams, Plan, Preview, RuleErrorCode } from '../types/actions.ts';
import type { GameState, PlayerState } from '../types/state.ts';
import { durationOptions } from './common.ts';
import { HANDLERS } from './handlers.ts';

export function playerById(state: Readonly<GameState>, id: string): PlayerState {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`unknown player ${id}`);
  return player;
}

/** Energy for `minutes` of unspent time when the week ends (FR-04). */
export function restBonusEnergy(content: GameContent, minutes: number): number {
  return Math.floor((minutes * content.balance.restBonusEnergyPerHour) / 60);
}

export const emptyPlan = (): Plan => ({
  time: 0,
  money: 0,
  effects: [],
  modifiers: [],
  outcomes: [],
  transfers: [],
});

/** What `action` would do for the active player, without changing state or using RNG. */
export function previewAction(
  content: GameContent,
  state: Readonly<GameState>,
  action: Action,
): Preview {
  const unavailable = (code: RuleErrorCode, plan: Plan | null = null): Preview => ({
    action,
    available: false,
    reason: { code },
    plan,
  });
  const { phase, pending } = state;
  if (phase.kind === 'gameOver') return unavailable('GAME_OVER');

  if (action.type === 'decide') {
    if (!pending || pending.id !== action.decisionId) return unavailable('NO_SUCH_DECISION');
    if (!pending.options.includes(action.optionId)) return unavailable('UNKNOWN_OPTION');
    // The option's own plan when the step gave one, such as a weekend event's choice (FR-03).
    return { action, available: true, plan: pending.plans[action.optionId] ?? emptyPlan() };
  }
  if (pending) return unavailable('DECISION_PENDING');
  if (phase.kind !== 'turn') throw new Error(`no player can act during ${phase.kind}`);

  const player = playerById(state, phase.player);
  const { board, actions } = content.city;
  let plan: Plan;
  switch (action.type) {
    case 'travel': {
      const mode = board.transportModes.find((m) => m.id === action.mode);
      const distance = loopDistance(board, player.location, action.to);
      if (distance === undefined) return unavailable('UNKNOWN_LOCATION');
      if (!mode) return unavailable('UNKNOWN_MODE');
      if (distance === 0) return unavailable('ALREADY_THERE');
      const trip = travelCost(mode, distance);
      const modifiers = collectModifiers(content, player, 'travelTime');
      plan = {
        time: applyModifiers(trip.minutes, modifiers),
        money: price(state.world, trip.money),
        effects: trip.energy > 0 ? [{ stat: 'energy', delta: -trip.energy }] : [],
        modifiers,
        outcomes: [],
        transfers: [],
      };
      if (mode.requiresItem && !player.items.includes(mode.requiresItem))
        return unavailable('NEEDS_ITEM', plan);
      break;
    }
    case 'perform': {
      const def = actions.find((a) => a.id === action.actionId);
      if (!def) return unavailable('UNKNOWN_ACTION');
      const params = paramsOf(action);
      const opens = unlockWeekOf(content, def, params);
      if (opens > state.week)
        return {
          action,
          available: false,
          reason: { code: 'NOT_UNLOCKED', unlockWeek: opens },
          plan: null,
        };
      const bad = checkParams(def, params);
      if (bad) return unavailable(bad);
      const result = HANDLERS[def.kind].plan({ content, state, player }, def, params);
      if ('code' in result) return unavailable(result.code);
      plan = result;
      if (def.location !== ANYWHERE && def.location !== player.location)
        return unavailable('WRONG_LOCATION', plan);
      const needs = checkRequires(content, player, def);
      if (needs) return unavailable(needs, plan);
      break;
    }
    case 'endWeek': {
      const energy = restBonusEnergy(content, player.timeLeft);
      plan = emptyPlan();
      if (energy > 0) plan.effects.push({ stat: 'energy', delta: energy });
      return { action, available: true, plan };
    }
  }
  if (plan.time > player.timeLeft) return unavailable('NOT_ENOUGH_TIME', plan);
  if (plan.money > player.stats.cash) return unavailable('NOT_ENOUGH_MONEY', plan);
  return { action, available: true, plan };
}

/** The first week an action (and, for `subscribe`, its target) is offered (FR-15). */
function unlockWeekOf(content: GameContent, def: LocationAction, params: PerformParams): number {
  const sub =
    def.kind === 'subscribe'
      ? content.city.subscriptions.find((s) => s.id === params.target)
      : undefined;
  return Math.max(def.unlockWeek ?? 1, sub?.unlockWeek ?? 1);
}

/** The `perform` parameters, without the keys that aren't set (state and logs stay plain JSON). */
export function paramsOf(action: Extract<Action, { type: 'perform' }>): PerformParams {
  const params: PerformParams = {};
  if (action.target !== undefined) params.target = action.target;
  if (action.minutes !== undefined) params.minutes = action.minutes;
  if (action.amount !== undefined) params.amount = action.amount;
  return params;
}

/** Durations must be one the action offers; amounts must be positive whole cents, and only for money actions. */
function checkParams(def: LocationAction, params: PerformParams): RuleErrorCode | null {
  if (def.durations ? !def.durations.includes(params.minutes ?? -1) : params.minutes !== undefined)
    return 'BAD_DURATION';
  const { amount } = params;
  if (def.amounts ? !(Number.isInteger(amount) && (amount ?? 0) > 0) : amount !== undefined)
    return 'BAD_AMOUNT';
  return null;
}

/** An action's item and housing requirements. */
function checkRequires(
  content: GameContent,
  player: Readonly<PlayerState>,
  def: LocationAction,
): RuleErrorCode | null {
  if (def.requires?.item && !player.items.includes(def.requires.item)) return 'NEEDS_ITEM';
  const housing = def.requires?.housing;
  if (housing) {
    const tiers = content.city.housing.map((h) => h.id);
    if (tiers.indexOf(player.housing.tier) < tiers.indexOf(housing)) return 'NEEDS_HOUSING';
  }
  return null;
}

/**
 * Every option for the active player, each marked available or not with a reason, so the UI can grey actions out
 * and say why: travel to every location by every mode, the actions here and anywhere-actions (one option per
 * target, duration or amount preset), and End Week (always available, so no
 * state is stuck). While a decision is pending, its options are the only ones.
 */
export function listActions(content: GameContent, state: Readonly<GameState>): Preview[] {
  const { phase, pending } = state;
  if (phase.kind === 'gameOver') return [];
  const preview = (action: Action) => previewAction(content, state, action);
  if (pending)
    return pending.options.map((optionId) =>
      preview({ type: 'decide', decisionId: pending.id, optionId }),
    );
  if (phase.kind !== 'turn') throw new Error(`no player can act during ${phase.kind}`);

  const { board } = content.city;
  const options: Preview[] = [];
  for (const loc of board.locations)
    for (const mode of board.transportModes)
      options.push(preview({ type: 'travel', to: loc.id, mode: mode.id }));
  options.push(...localActions(content, state));
  options.push(preview({ type: 'endWeek' }));
  return options;
}

/** The `perform` options at the active player's location and anywhere-actions: one per target, duration or amount. */
export function localActions(content: GameContent, state: Readonly<GameState>): Preview[] {
  const { phase } = state;
  if (phase.kind !== 'turn') throw new Error(`no player can act during ${phase.kind}`);
  const player = playerById(state, phase.player);
  const options: Preview[] = [];
  for (const def of content.city.actions) {
    if (def.location !== player.location && def.location !== ANYWHERE) continue;
    const handler = HANDLERS[def.kind];
    const variants = handler.options
      ? handler.options({ content, state, player }, def)
      : durationOptions(def);
    for (const params of variants)
      options.push(previewAction(content, state, { type: 'perform', actionId: def.id, ...params }));
  }
  return options;
}
