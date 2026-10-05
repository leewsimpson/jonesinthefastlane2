/** Stat changes and stat-driven modifiers (engine-design §10, §8.3). */
import type { GameContent } from '@fastlane/content';
import { type ModifierTarget, STAT_KEYS, type StatKey } from '@fastlane/content/keys';
import type { Emitter } from '../core/context.ts';
import { applyBp, BP_ONE, clamp } from '../math/fixed.ts';
import type { AppliedModifier } from '../types/actions.ts';
import type { Cause } from '../types/events.ts';
import type { PlayerState } from '../types/state.ts';

/**
 * The one write path for stats other than cash. Clamps to the stat's range (FR-20), emits `statChanged` and returns
 * the applied delta, which can be smaller than requested. Cash moves only through the ledger (`money/ledger.ts`), so
 * every cent has a named source or sink; calling this for cash throws.
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
  if (stat === 'cash') throw new Error('cash moves through the ledger, not changeStat');
  const from = player.stats[stat];
  const { min, max } = ctx.content.balance.statRanges[stat];
  const to = clamp(from + delta, min, max ?? Number.POSITIVE_INFINITY);
  if (to === from) return 0;
  player.stats[stat] = to;
  ctx.emit({ type: 'statChanged', player: player.id, stat, from, to, cause });
  return to - from;
}

/** Apply several non-cash deltas in `STAT_KEYS` order, so the event order never depends on JSON key order. */
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
 * Modifiers on `target` for this player, in a fixed order: stat thresholds, then items in content order, then
 * subscriptions, then the AI-tools skill (FR-42), then news (Phase 3). Sources are copy keys.
 */
export function collectModifiers(
  content: GameContent,
  player: Readonly<PlayerState>,
  target: ModifierTarget,
): AppliedModifier[] {
  const found: AppliedModifier[] = [];
  for (const m of content.balance.statModifiers) {
    if (m.target === target && player.stats[m.stat] < m.below)
      found.push({ source: `modifier.${m.id}`, target, bp: m.bp });
  }
  for (const item of content.city.items)
    if (player.items.includes(item.id))
      for (const m of item.modifiers)
        if (m.target === target) found.push({ source: `item.${item.id}`, target, bp: m.bp });
  for (const sub of content.city.subscriptions)
    if (player.subscriptions.includes(sub.id))
      for (const m of sub.modifiers)
        if (m.target === target) found.push({ source: `subscription.${sub.id}`, target, bp: m.bp });
  if (target === 'workOutput') {
    const ai = content.balance.aiDisruption;
    const bp = Math.min(
      ai.maxOutputBp,
      skillPoints(content, player, ai.track) * ai.outputPerPointBp,
    );
    if (bp > 0) found.push({ source: `track.${ai.track}`, target, bp });
  }
  return found;
}

/** Skill points on one track: ⌊√(hours studied × scale)⌋, so each track has diminishing returns (§3 Skills). */
export function skillPoints(
  content: GameContent,
  player: Readonly<PlayerState>,
  track: string,
): number {
  const minutes = player.trackMinutes[track] ?? 0;
  return Math.floor(Math.sqrt(Math.floor((minutes * content.balance.skills.pointsScale) / 60)));
}

/** Study minutes on a track that give `points` skill points: the inverse of `skillPoints`. */
export function skillMinutesFor(content: GameContent, points: number): number {
  return Math.ceil((points * points * 60) / content.balance.skills.pointsScale);
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
