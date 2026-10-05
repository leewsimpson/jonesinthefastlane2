/** Whether an event, choice or quest applies to a player (FR-70: condition-filtered). */
import type { Condition, GameContent } from '@fastlane/content';
import { STAT_KEYS } from '@fastlane/content/keys';
import { totalDebt } from '../money/ledger.ts';
import type { PlayerState } from '../types/state.ts';

export function meets(
  content: GameContent,
  week: number,
  player: Readonly<PlayerState>,
  when: Condition | undefined,
): boolean {
  if (!when) return true;
  if (when.minWeek !== undefined && week < when.minWeek) return false;
  if (when.maxWeek !== undefined && week > when.maxWeek) return false;
  if (when.stats)
    for (const stat of STAT_KEYS) {
      const bound = when.stats[stat];
      if (!bound) continue;
      const value = player.stats[stat];
      if (bound.min !== undefined && value < bound.min) return false;
      if (bound.max !== undefined && value > bound.max) return false;
    }
  if (when.job !== undefined && (player.job !== null) !== when.job) return false;
  if (when.housing && !when.housing.includes(player.housing.tier)) return false;
  if (when.items && !when.items.every((i) => player.items.includes(i))) return false;
  if (when.notItems?.some((i) => player.items.includes(i))) return false;
  if (when.debt !== undefined && totalDebt(player) > 0 !== when.debt) return false;
  if (when.enrolled !== undefined && (player.enrollment !== null) !== when.enrolled) return false;
  if (when.invested !== undefined) {
    const invested = content.balance.market.assets.some((a) => (player.holdings[a.id] ?? 0) > 0);
    if (invested !== when.invested) return false;
  }
  if (when.subscribed !== undefined && player.subscriptions.length > 0 !== when.subscribed)
    return false;
  return true;
}
