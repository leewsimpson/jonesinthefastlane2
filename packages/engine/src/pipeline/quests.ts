/**
 * P7: micro-goals (ENG-11). Each player has `balance.quests.active` quests on the go. Every week, finished ones pay
 * their reward, expired ones fail, and new ones are drawn on the player's `quests` stream from those whose
 * condition holds. Progress is the change in a measure since the quest was issued.
 */
import type { GameContent, Quest, QuestGoal } from '@fastlane/content';
import type { Emitter, PlayerCtx } from '../core/context.ts';
import { netWorth } from '../goals/goals.ts';
import { meets } from '../hooks/conditions.ts';
import { jobById } from '../jobs/jobs.ts';
import { totalDebt, transfer } from '../money/ledger.ts';
import type { Rng } from '../rng/rng.ts';
import { changeStats } from '../stats/stats.ts';
import type { Cause } from '../types/events.ts';
import type { PlayerState } from '../types/state.ts';
import type { PipelineStep } from './types.ts';

export function questById(content: GameContent, id: string): Quest {
  const quest = content.quests.find((q) => q.id === id);
  if (!quest) throw new Error(`unknown quest ${id}`);
  return quest;
}

const sum = (record: Readonly<Record<string, number>>) =>
  Object.values(record).reduce((a, b) => a + b, 0);

/** The number a quest goal watches. */
export function questMeasure(
  content: GameContent,
  player: Readonly<PlayerState>,
  goal: QuestGoal,
): number {
  switch (goal.kind) {
    case 'save':
      return netWorth(content, player);
    case 'stat':
      return player.stats[goal.stat];
    case 'hired':
      return player.job ? 1 : 0;
    case 'promoted':
      return player.job ? jobById(content, player.job.id).level : 0;
    case 'credential':
      return player.credentials.length;
    case 'debt-free':
      return totalDebt(player);
    case 'move-up':
      return content.city.housing.findIndex((h) => h.id === player.housing.tier);
    case 'work':
      return sum(player.experience);
    case 'study':
      return sum(player.trackMinutes);
  }
}

/** The value a stat quest needs: absolute, or `by` above where it started (never past the stat's maximum). */
export function statTarget(
  content: GameContent,
  goal: Extract<QuestGoal, { kind: 'stat' }>,
  baseline: number,
): number {
  if (goal.atLeast !== undefined) return goal.atLeast;
  const max = content.balance.statRanges[goal.stat].max ?? Number.POSITIVE_INFINITY;
  return Math.min(baseline + (goal.by ?? 0), max);
}

/** How far along a quest is, in basis points of done (10 000 = done). */
export function questProgressBp(
  content: GameContent,
  player: Readonly<PlayerState>,
  goal: QuestGoal,
  baseline: number,
): number {
  const now = questMeasure(content, player, goal);
  const ratio = (got: number, need: number) =>
    need <= 0 ? 10_000 : Math.max(0, Math.min(10_000, Math.floor((got * 10_000) / need)));
  switch (goal.kind) {
    case 'save':
      return ratio(now - baseline, goal.amount);
    case 'stat': {
      const target = statTarget(content, goal, baseline);
      return now >= target ? 10_000 : ratio(now - baseline, target - baseline);
    }
    case 'hired':
      return now === 1 ? 10_000 : 0;
    case 'promoted':
    case 'credential':
    case 'move-up':
      return now > baseline ? 10_000 : 0;
    case 'debt-free':
      return now === 0 ? 10_000 : ratio(baseline - now, baseline);
    case 'work':
    case 'study':
      return ratio(now - baseline, goal.minutes);
  }
}

/** Quests that could be issued to this player now: condition holds, not on the go, off cooldown. */
function eligible(content: GameContent, week: number, player: Readonly<PlayerState>): Quest[] {
  const { cooldownWeeks } = content.balance.quests;
  return content.quests.filter((q) => {
    if (player.quests.some((a) => a.id === q.id)) return false;
    const seen = player.seenQuests[q.id];
    if (seen !== undefined && week - seen < cooldownWeeks) return false;
    // A quest already done the moment it's issued is no quest.
    if (questProgressBp(content, player, q.goal, questMeasure(content, player, q.goal)) >= 10_000)
      return false;
    return meets(content, week, player, q.when);
  });
}

/**
 * Top the player up to `balance.quests.active` quests. `week` is the first week each can be worked on; it runs for
 * `quest.weeks` weeks from then.
 */
export function issueQuests(ctx: Emitter, player: PlayerState, week: number, rng: Rng): void {
  const { content } = ctx;
  while (player.quests.length < content.balance.quests.active) {
    const pool = eligible(content, week, player);
    if (pool.length === 0) return;
    const quest = rng.pick(pool.map((q) => ({ weight: q.weight, value: q })));
    const deadline = week + quest.weeks - 1;
    player.quests.push({
      id: quest.id,
      deadline,
      baseline: questMeasure(content, player, quest.goal),
    });
    ctx.emit({ type: 'questIssued', player: player.id, quest: quest.id, deadline });
  }
}

export const questProgress: PipelineStep<PlayerCtx> = {
  id: 'quest-progress',
  run(ctx) {
    const { player, content, week } = ctx;
    const kept = [];
    for (const active of player.quests) {
      const quest = questById(content, active.id);
      if (questProgressBp(content, player, quest.goal, active.baseline) >= 10_000) {
        const cause: Cause = { kind: 'quest', id: quest.id };
        transfer(ctx, player, 'outside', 'cash', quest.reward.cash, 'reward', cause);
        changeStats(ctx, player, quest.reward.stats, cause);
        player.questsDone += 1;
        player.seenQuests[quest.id] = week;
        ctx.emit({ type: 'questCompleted', player: player.id, quest: quest.id });
      } else if (week >= active.deadline) {
        player.seenQuests[quest.id] = week;
        ctx.emit({ type: 'questFailed', player: player.id, quest: quest.id });
      } else kept.push(active);
    }
    player.quests = kept;
    // New quests start next week.
    issueQuests(ctx, player, week + 1, ctx.rng('quests'));
    return { done: true };
  },
};
