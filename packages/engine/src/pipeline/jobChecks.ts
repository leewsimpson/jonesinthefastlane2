/** P4: AI disruption (FR-42), performance and promotions (FR-43), GigHub deactivation countdown (FR-44). */
import type { PlayerCtx } from '../core/context.ts';
import {
  effectiveExposure,
  jobById,
  newJobState,
  nextOnLadder,
  qualification,
} from '../jobs/jobs.ts';
import { applyBp, BP_ONE } from '../math/fixed.ts';
import type { JobChange } from '../types/events.ts';
import type { PipelineStep } from './types.ts';

type Disruption = 'hoursCut' | 'restructure' | 'layoff';

/** News modifiers on the disruption rate arrive with the news ticker in Phase 3 (FR-72). */
const NEWS_DISRUPTION_BP = BP_ONE;

/**
 * Weekly chance = base rate × the player's effective exposure × news, rolled on the `job` stream. A hit cuts hours,
 * restructures the role (a wage cut) or warns of a layoff, which lands at the next check (FR-42).
 */
function rollDisruption(ctx: PlayerCtx): void {
  const { player, content, config } = ctx;
  const job = player.job;
  if (!job) return;
  const ai = content.balance.aiDisruption;
  const exposure = effectiveExposure(content, player, jobById(content, job.id));
  const weekly = applyBp(applyBp(ai.baseRateBp, exposure), NEWS_DISRUPTION_BP);
  const rng = ctx.rng('job');
  if (!rng.chance(Math.min(BP_ONE, weekly * config.turnLengthWeeks))) return;
  const w = ai.outcomeWeights;
  const hit = rng.pick<Disruption>([
    { weight: w.hoursCut, value: 'hoursCut' },
    { weight: w.restructure, value: 'restructure' },
    { weight: w.layoff, value: 'layoff' },
  ]);
  let change: JobChange;
  if (hit === 'hoursCut') {
    job.hoursCapBp = Math.max(ai.minHoursCapBp, job.hoursCapBp + ai.hoursCutBp);
    change = 'hoursCut';
  } else if (hit === 'restructure') {
    job.wageBp = Math.max(ai.minWageBp, job.wageBp + ai.restructureWageBp);
    change = 'restructured';
  } else {
    job.layoffWarning = true;
    change = 'layoffWarning';
  }
  ctx.emit({ type: 'jobChanged', player: player.id, change, job: job.id });
}

/** Performance falls in a week with no shifts; at 0 the player is let go. Otherwise check for a promotion. */
function reviewPerformance(ctx: PlayerCtx): void {
  const { player, content } = ctx;
  const job = player.job;
  if (!job || job.layoffWarning) return;
  const rules = content.balance.jobs;
  if (job.minutesThisWeek === 0) {
    job.rating = Math.max(0, job.rating - rules.noShowPenalty);
    if (job.rating === 0) {
      player.job = null;
      ctx.emit({ type: 'jobChanged', player: player.id, change: 'letGo', job: job.id });
    }
    return;
  }
  const next = nextOnLadder(content, jobById(content, job.id));
  if (next && job.rating >= rules.promotionRating && !qualification(content, player, next)) {
    player.job = newJobState(content, next.id);
    ctx.emit({ type: 'jobChanged', player: player.id, change: 'promoted', job: next.id });
  }
}

export const jobChecks: PipelineStep<PlayerCtx> = {
  id: 'job-checks',
  run(ctx) {
    const { player, config } = ctx;
    player.gigBanWeeks = Math.max(0, player.gigBanWeeks - config.turnLengthWeeks);
    const job = player.job;
    if (job?.layoffWarning) {
      player.job = null;
      ctx.emit({ type: 'jobChanged', player: player.id, change: 'laidOff', job: job.id });
    } else if (job) {
      rollDisruption(ctx);
      reviewPerformance(ctx);
    }
    if (player.job) player.job.minutesThisWeek = 0;
    return { done: true };
  },
};
