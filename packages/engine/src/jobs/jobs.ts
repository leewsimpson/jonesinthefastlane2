/** Jobs and careers (FR-40–FR-43): who qualifies, what a shift pays, how exposed a job is to AI. */
import type { GameContent, Job } from '@fastlane/content';
import { wage } from '../economy/prices.ts';
import { applyBp, BP_ONE } from '../math/fixed.ts';
import { skillPoints } from '../stats/stats.ts';
import type { RuleErrorCode } from '../types/actions.ts';
import type { JobState, PlayerState, WorldState } from '../types/state.ts';

export function jobById(content: GameContent, id: string): Job {
  const job = content.city.jobs.find((j) => j.id === id);
  if (!job) throw new Error(`unknown job ${id}`);
  return job;
}

/** The next rung on a job's ladder, if there is one (FR-41). */
export function nextOnLadder(content: GameContent, job: Job): Job | undefined {
  return content.city.jobs.find((j) => j.ladder === job.ladder && j.level === job.level + 1);
}

/** Why the player can't hold this job, or null if they can (FR-40). Checked in the order the UI explains them. */
export function qualification(
  content: GameContent,
  player: Readonly<PlayerState>,
  job: Job,
): RuleErrorCode | null {
  if (player.stats.wardrobe < job.dressTier) return 'DRESS_CODE';
  if (job.requires.credentials.some((c) => !player.credentials.includes(c)))
    return 'NEEDS_CREDENTIAL';
  for (const [track, points] of Object.entries(job.requires.skills))
    if (skillPoints(content, player, track) < points) return 'NEEDS_SKILL';
  if ((player.experience[job.ladder] ?? 0) < job.minExperience) return 'NEEDS_EXPERIENCE';
  return null;
}

/** A fresh job record for a new hire or promotion. */
export function newJobState(content: GameContent, id: string, rating?: number): JobState {
  return {
    id,
    wageBp: BP_ONE,
    hoursCapBp: BP_ONE,
    rating: rating ?? content.balance.jobs.ratingStart,
    minutesThisWeek: 0,
    layoffWarning: false,
  };
}

/** The player's AI exposure on this job after their AI-tools skill (FR-42), in basis points. */
export function effectiveExposure(
  content: GameContent,
  player: Readonly<PlayerState>,
  job: Job,
): number {
  const ai = content.balance.aiDisruption;
  const cut = Math.min(
    ai.maxExposureCutBp,
    skillPoints(content, player, ai.track) * ai.exposureCutPerPointBp,
  );
  return applyBp(job.aiExposureBp, BP_ONE - cut);
}

/** Most minutes the job allows this week, after hours cuts (FR-42). */
export function weeklyCap(content: GameContent, job: Readonly<JobState>): number {
  return applyBp(content.balance.jobs.maxWeeklyMinutes, job.hoursCapBp);
}

/** Pay for `minutes` of work, before output modifiers: base wage × restructure cuts × the wage index. */
export function shiftPay(
  content: GameContent,
  world: Readonly<WorldState>,
  job: Readonly<JobState>,
  minutes: number,
): number {
  const hourly = wage(world, applyBp(jobById(content, job.id).wage, job.wageBp));
  return Math.floor((hourly * minutes) / 60);
}
