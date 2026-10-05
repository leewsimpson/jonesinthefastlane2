/**
 * Previews and the legal-action list (engine-design §8, FR-03). This is the single legality check: `reduce` refuses
 * anything `previewAction` marks unavailable, so the UI and the rules can't disagree.
 */
import type { GameContent } from '@fastlane/content';
import { loopDistance, travelCost } from '../board/board.ts';
import { applyModifiers, collectModifiers } from '../stats/stats.ts';
import type { Action, Plan, Preview, RuleErrorCode } from '../types/actions.ts';
import type { GameState, PlayerState } from '../types/state.ts';
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

const emptyPlan = (): Plan => ({ time: 0, money: 0, effects: [], modifiers: [], outcomes: [] });

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
    return { action, available: true, plan: emptyPlan() };
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
        money: trip.money,
        effects: trip.energy > 0 ? [{ stat: 'energy', delta: -trip.energy }] : [],
        modifiers,
        outcomes: [],
      };
      if (mode.requiresItem && !player.items.includes(mode.requiresItem))
        return unavailable('NEEDS_ITEM', plan);
      break;
    }
    case 'perform': {
      const def = actions.find((a) => a.id === action.actionId);
      if (!def) return unavailable('UNKNOWN_ACTION');
      const result = HANDLERS[def.kind].plan({ content, state, player }, def);
      if ('code' in result) return unavailable(result.code);
      plan = result;
      if (def.location !== player.location) return unavailable('WRONG_LOCATION', plan);
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

/**
 * Every option for the active player, each marked available or not with a reason, so the UI can grey actions out
 * and say why: travel to every location by every mode, the actions here, and End Week (always available, so no
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

  const player = playerById(state, phase.player);
  const { board, actions } = content.city;
  const options: Preview[] = [];
  for (const loc of board.locations)
    for (const mode of board.transportModes)
      options.push(preview({ type: 'travel', to: loc.id, mode: mode.id }));
  for (const a of actions)
    if (a.location === player.location) options.push(preview({ type: 'perform', actionId: a.id }));
  options.push(preview({ type: 'endWeek' }));
  return options;
}
