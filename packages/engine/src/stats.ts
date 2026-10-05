import type { Balance } from '@fastlane/content';
import { STAT_KEYS, type StatKey } from '@fastlane/content/keys';
import type { StatChanges, Stats } from './types.ts';

/** Clamp a stat value into its inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampStat(balance: Balance, key: StatKey, value: number): number {
  const { min, max } = balance.statRanges[key];
  return clamp(value, min, max ?? Number.POSITIVE_INFINITY);
}

/** Apply deltas in place, clamped to each stat's range (FR-20). Returns the changes that actually happened. */
export function applyDeltas(balance: Balance, stats: Stats, deltas: StatChanges): StatChanges {
  const applied: StatChanges = {};
  for (const key of STAT_KEYS) {
    const delta = deltas[key];
    if (delta === undefined || delta === 0) continue;
    const next = clampStat(balance, key, stats[key] + delta);
    if (next !== stats[key]) applied[key] = next - stats[key];
    stats[key] = next;
  }
  return applied;
}
