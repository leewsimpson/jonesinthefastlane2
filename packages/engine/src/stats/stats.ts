/** Stat changes and stat-driven modifiers (engine-design §10, §8.3). */
import type { GameContent } from '@fastlane/content';
import { type ModifierTarget, STAT_KEYS, type StatKey } from '@fastlane/content/keys';
import type { Emitter } from '../core/context.ts';
import { applyBp, BP_ONE, clamp } from '../math/fixed.ts';
import type { AppliedModifier } from '../types/actions.ts';
import type { Cause } from '../types/events.ts';
import type { PlayerState } from '../types/state.ts';

/**
 * The one write path for stats. Clamps to the stat's range (FR-20), emits `statChanged` and returns the applied
 * delta, which can be smaller than requested. Cash is never clamped: clamping at 0 would create money, so a change
 * that would make it negative is an engine bug and throws (FR-14).
 */
export function changeStat(
  ctx: Emitter,
  player: PlayerState,
  stat: StatKey,
  delta: number,
  cause: Cause,
): number {
  if (!Number.isInteger(delta))
    throw new Error(`stat delta for ${stat} is not an integer: ${delta}`);
  const from = player.stats[stat];
  const { min, max } = ctx.content.balance.statRanges[stat];
  let to = from + delta;
  if (stat === 'cash') {
    if (to < min) throw new Error(`cash would go negative for ${player.id} (${from} + ${delta})`);
  } else {
    to = clamp(to, min, max ?? Number.POSITIVE_INFINITY);
  }
  if (to === from) return 0;
  player.stats[stat] = to;
  ctx.emit({ type: 'statChanged', player: player.id, stat, from, to, cause });
  return to - from;
}

/** Apply several deltas in `STAT_KEYS` order, so the event order never depends on JSON key order. */
export function changeStats(
  ctx: Emitter,
  player: PlayerState,
  deltas: Partial<Record<StatKey, number>>,
  cause: Cause,
): void {
  for (const stat of STAT_KEYS) {
    const delta = deltas[stat];
    if (delta) changeStat(ctx, player, stat, delta, cause);
  }
}

/**
 * Modifiers on `target` for this player, in a fixed order: stat thresholds from balance data (Phase 1), then items
 * (Phase 2), then news (Phase 3).
 */
export function collectModifiers(
  content: GameContent,
  player: Readonly<PlayerState>,
  target: ModifierTarget,
): AppliedModifier[] {
  const found: AppliedModifier[] = [];
  for (const m of content.balance.statModifiers) {
    if (m.target === target && player.stats[m.stat] < m.below)
      found.push({ source: m.id, target, bp: m.bp });
  }
  return found;
}

/** Scale `value` by the summed modifiers, applied once, so stacking order never changes the result. */
export function applyModifiers(value: number, modifiers: readonly AppliedModifier[]): number {
  if (modifiers.length === 0) return value;
  const bp = modifiers.reduce((sum, m) => sum + m.bp, 0);
  return applyBp(value, Math.max(0, BP_ONE + bp));
}

/** Scale an output gain. Losses are never scaled. */
export function scaleGain(value: number, modifiers: readonly AppliedModifier[]): number {
  return value > 0 ? applyModifiers(value, modifiers) : value;
}
