import type { GameContent, LocationAction } from '@fastlane/content';
import { STAT_KEYS } from '@fastlane/content/keys';
import { loopDistance, travelCost } from './board.ts';
import type {
  ActionPreview,
  Blocker,
  GameAction,
  GameState,
  Modifier,
  PlayerState,
} from './types.ts';

export function currentPlayer(state: GameState): PlayerState {
  const player = state.players[state.turn];
  if (!player) throw new Error(`no player at turn index ${state.turn}`);
  return player;
}

/** Modifiers that apply to an action's output gains for this player right now (FR-21). */
export function outputModifiers(
  content: GameContent,
  player: PlayerState,
  action: LocationAction,
): Modifier[] {
  if (!action.tags.includes('output')) return [];
  const { threshold, outputMultiplier } = content.balance.lowEnergy;
  return player.stats.energy < threshold ? [{ id: 'lowEnergy', multiplier: outputMultiplier }] : [];
}

/** Scale a positive output gain by the modifiers. Losses are never scaled. */
export function scaleGain(value: number, modifiers: Modifier[]): number {
  if (value <= 0) return value;
  return Math.round(modifiers.reduce((v, m) => v * m.multiplier, value));
}

/**
 * Work out what an action would do for the current player, without changing state or using RNG (FR-03).
 * This is also the single legality check: `reduce` refuses any action with blockers.
 */
export function previewAction(
  content: GameContent,
  state: GameState,
  action: GameAction,
): ActionPreview {
  const player = currentPlayer(state);
  const blockers: Blocker[] = [];
  const preview: ActionPreview = {
    action,
    hours: 0,
    cost: 0,
    effects: {},
    modifiers: [],
    blockers,
  };
  const { board } = content.city;

  switch (action.type) {
    case 'travel': {
      const mode = board.transportModes.find((m) => m.id === action.mode);
      const steps = loopDistance(board, player.location, action.to);
      if (!mode) blockers.push('unknownMode');
      if (steps === undefined) blockers.push('unknownLocation');
      if (!mode || steps === undefined) return preview;
      if (steps === 0) blockers.push('alreadyThere');
      if (mode.requiresItem && !player.items.includes(mode.requiresItem))
        blockers.push('needsItem');
      const trip = travelCost(mode, steps);
      preview.hours = trip.hours;
      preview.cost = trip.cost;
      if (trip.energy > 0) preview.effects.energy = { min: -trip.energy, max: -trip.energy };
      break;
    }
    case 'perform': {
      const def = content.city.actions.find((a) => a.id === action.action);
      if (!def) {
        blockers.push('unknownAction');
        return preview;
      }
      if (def.location !== player.location) blockers.push('wrongLocation');
      preview.hours = def.hours;
      preview.cost = def.cost;
      preview.modifiers = outputModifiers(content, player, def);
      for (const key of STAT_KEYS) {
        const effect = def.effects[key];
        if (effect === undefined) continue;
        const [min, max] = typeof effect === 'number' ? [effect, effect] : [effect.min, effect.max];
        preview.effects[key] = {
          min: scaleGain(min, preview.modifiers),
          max: scaleGain(max, preview.modifiers),
        };
      }
      break;
    }
    case 'endWeek': {
      const bonus = player.hoursLeft * content.balance.restBonusEnergyPerHour;
      if (bonus > 0) preview.effects.energy = { min: bonus, max: bonus };
      return preview;
    }
  }

  if (preview.cost > 0) {
    const gain = preview.effects.cash ?? { min: 0, max: 0 };
    preview.effects.cash = { min: gain.min - preview.cost, max: gain.max - preview.cost };
  }
  if (preview.hours > player.hoursLeft) blockers.push('notEnoughTime');
  if (preview.cost > player.stats.cash) blockers.push('notEnoughCash');
  return preview;
}
