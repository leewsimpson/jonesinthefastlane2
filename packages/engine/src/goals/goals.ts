/**
 * Goals, progress and score (§3, FR-11, FR-12). Values are integers: wealth in cents, the others in points.
 * Progress is in basis points of the target; the score is the average progress with each goal capped at 100%.
 */
import type { GameContent } from '@fastlane/content';
import { GOAL_KEYS, type GoalKey } from '@fastlane/content/keys';
import { effectiveExposure, jobById } from '../jobs/jobs.ts';
import { applyBp, BP_ONE } from '../math/fixed.ts';
import { financialNetWorth } from '../money/ledger.ts';
import { skillPoints } from '../stats/stats.ts';
import type { GoalTargets, PlayerState } from '../types/state.ts';

export type GoalValues = Record<GoalKey, number>;

/** Items at resale value (§3 Wealth), so buying gadgets can't inflate net worth. */
export function itemsValue(content: GameContent, player: Readonly<PlayerState>): number {
  let total = 0;
  for (const id of player.items) {
    const item = content.city.items.find((i) => i.id === id);
    if (!item) throw new Error(`unknown item ${id}`);
    total += applyBp(item.price, item.resaleBp);
  }
  return total;
}

/** Cash + savings + investments + deposit + items − debt, in cents. */
export function netWorth(content: GameContent, player: Readonly<PlayerState>): number {
  return financialNetWorth(player) + itemsValue(content, player);
}

/** MVP Wellbeing: the mean of Happiness, Health and Social, minus a share of how far the lowest lags the mean. */
export function wellbeing(content: GameContent, player: Readonly<PlayerState>): number {
  const { happiness, health, social } = player.stats;
  const mean = Math.floor((happiness + health + social) / 3);
  const lowest = Math.min(happiness, health, social);
  return mean - applyBp(mean - lowest, content.balance.goals.wellbeingLowPartPenaltyBp);
}

/** Credential points plus skill points on every track. */
export function skillsValue(content: GameContent, player: Readonly<PlayerState>): number {
  let total = 0;
  for (const id of player.credentials) {
    const course = content.city.courses.find((c) => c.id === id);
    if (!course) throw new Error(`unknown course ${id}`);
    total += course.credentialPoints;
  }
  for (const track of content.balance.skills.tracks) total += skillPoints(content, player, track);
  return total;
}

/** Job level × stability, where stability = 1 − exposure × ½. Reputation adds on top once it exists (§3 Career). */
export function careerValue(content: GameContent, player: Readonly<PlayerState>): number {
  if (!player.job) return 0;
  const job = jobById(content, player.job.id);
  const { careerPointsPerLevel, stabilityExposureBp } = content.balance.goals;
  const stability = BP_ONE - applyBp(effectiveExposure(content, player, job), stabilityExposureBp);
  const reputation = 0;
  return applyBp(job.level * careerPointsPerLevel, stability) + reputation;
}

export function goalValues(content: GameContent, player: Readonly<PlayerState>): GoalValues {
  return {
    wealth: netWorth(content, player),
    wellbeing: wellbeing(content, player),
    skills: skillsValue(content, player),
    career: careerValue(content, player),
  };
}

/** Uncapped progress toward each target, in basis points (negative net worth gives negative wealth progress). */
export function rawProgressBp(values: GoalValues, targets: GoalTargets): GoalValues {
  const out = {} as GoalValues;
  for (const key of GOAL_KEYS) out[key] = Math.floor((values[key] * BP_ONE) / targets[key]);
  return out;
}

/** Progress for the goal rings (FR-13): 0–10 000 per goal. */
export function progressBp(values: GoalValues, targets: GoalTargets): GoalValues {
  const raw = rawProgressBp(values, targets);
  for (const key of GOAL_KEYS) raw[key] = Math.min(BP_ONE, Math.max(0, raw[key]));
  return raw;
}

/** FR-12: the average progress, each goal capped at 100%. Shared with the Daily Run score. */
export function scoreBp(progress: GoalValues): number {
  let total = 0;
  for (const key of GOAL_KEYS) total += progress[key];
  return Math.floor(total / GOAL_KEYS.length);
}

/** All four targets met (FR-11). */
export function hasWon(progress: GoalValues): boolean {
  return GOAL_KEYS.every((key) => progress[key] >= BP_ONE);
}

/** FR-11 tiebreak: the total overshoot past the targets, in basis points. */
export function overshootBp(values: GoalValues, targets: GoalTargets): number {
  const raw = rawProgressBp(values, targets);
  let total = 0;
  for (const key of GOAL_KEYS) total += raw[key] - BP_ONE;
  return total;
}
