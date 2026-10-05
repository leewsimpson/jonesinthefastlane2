/** Work: job shifts, GigHub and applying for jobs (FR-40–FR-44). */
import { wage } from '../economy/prices.ts';
import { newsEffect } from '../hooks/news.ts';
import { jobById, newJobState, qualification, shiftPay, weeklyCap } from '../jobs/jobs.ts';
import { applyBp, BP_ONE } from '../math/fixed.ts';
import { scaleGain } from '../stats/stats.ts';
import {
  type ActionHandler,
  applyPlan,
  durationOptions,
  fail,
  minutesOf,
  planFromData,
} from './common.ts';

/**
 * A shift at the player's employer, or from home for a remote job (FR-46). Pay lands at the end of the shift
 * (FR-43), so the first paycheck comes in week 1 (ENG-20). Builds experience on the job's ladder and performance.
 */
export const workShift: ActionHandler = {
  options: (_ctx, def) => durationOptions(def),
  plan(ctx, def, params) {
    const { player, content } = ctx;
    if (!player.job) return fail('NO_JOB');
    const job = jobById(content, player.job.id);
    if (def.remote ? !job.remote : job.location !== def.location) return fail('NO_JOB');
    const minutes = minutesOf(def, params);
    if (player.job.minutesThisWeek + minutes > weeklyCap(content, player.job))
      return fail('HOURS_CAP');
    const plan = planFromData(ctx, def, params);
    const pay = scaleGain(shiftPay(content, ctx.state.world, player.job, minutes), plan.modifiers);
    plan.effects.unshift({ stat: 'cash', delta: pay });
    return plan;
  },
  apply(ctx, def, plan) {
    const { player, content } = ctx;
    const state = player.job;
    if (!state) throw new Error('unreachable: the plan checked the job');
    applyPlan(ctx, def, plan, { income: 'wage' });
    const job = jobById(content, state.id);
    state.minutesThisWeek += plan.time;
    player.experience[job.ladder] = (player.experience[job.ladder] ?? 0) + plan.time;
    const gained = Math.floor((plan.time * content.balance.jobs.ratingPerHour) / 60);
    state.rating = Math.min(100, state.rating + gained);
  },
};

/**
 * GigHub (FR-44): anywhere, pay rolled per shift within a range that news surges move, a chance of deactivation,
 * no ladder experience.
 */
export const gig: ActionHandler = {
  options: (_ctx, def) => durationOptions(def),
  plan(ctx, def, params) {
    if (ctx.player.gigBanWeeks > 0) return fail('GIG_DEACTIVATED');
    const minutes = minutesOf(def, params);
    const plan = planFromData(ctx, def, params);
    const { min, max } = ctx.content.city.gigPayPerHour;
    // Surge pricing comes from the news (FR-44, FR-72).
    const surge = Math.max(0, BP_ONE + newsEffect(ctx.content, ctx.state.world, 'gigPayBp'));
    const pay = (perHour: number) =>
      scaleGain(
        Math.floor((applyBp(wage(ctx.state.world, perHour), surge) * minutes) / 60),
        plan.modifiers,
      );
    plan.outcomes.unshift({ stat: 'cash', min: pay(min), max: pay(max) });
    return plan;
  },
  apply(ctx, def, plan) {
    applyPlan(ctx, def, plan, { income: 'gig' });
    const { deactivationChanceBp, deactivationWeeks } = ctx.content.balance.gig;
    if (ctx.rng('action').chance(deactivationChanceBp)) {
      ctx.player.gigBanWeeks = deactivationWeeks;
      ctx.emit({ type: 'gigDeactivated', player: ctx.player.id, weeks: deactivationWeeks });
    }
  },
};

/**
 * JobLink (FR-40): apply for an open job you qualify for. Hiring is immediate; your old job ends. The weekly hours
 * cap counts hours from both, and the rating comes with you.
 */
export const applyJob: ActionHandler = {
  options: (ctx) => ctx.content.city.jobs.map((j) => ({ target: j.id })),
  plan(ctx, def, params) {
    const { content, player, state } = ctx;
    const job = content.city.jobs.find((j) => j.id === params.target);
    if (!job) return fail('BAD_TARGET');
    if (player.job?.id === job.id) return fail('ALREADY_HIRED');
    if (!state.world.openings.includes(job.id)) return fail('NOT_OPEN');
    const why = qualification(content, player, job);
    if (why) return fail(why);
    return planFromData(ctx, def, params);
  },
  apply(ctx, def, plan, params) {
    applyPlan(ctx, def, plan);
    const id = params.target;
    if (!id) throw new Error('unreachable: the plan checked the target');
    // Hours worked this week and the rating carry over: changing jobs can't reset the weekly cap or wipe a poor
    // record (the balance sim found bots re-applying to dodge being let go).
    const old = ctx.player.job;
    ctx.player.job = {
      ...newJobState(ctx.content, id, old?.rating),
      minutesThisWeek: old?.minutesThisWeek ?? 0,
    };
    ctx.emit({ type: 'jobChanged', player: ctx.player.id, change: 'hired', job: id });
  },
};
