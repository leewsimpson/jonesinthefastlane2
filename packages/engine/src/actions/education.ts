/** UpSkill U (§5): enrol in a course, study hours toward its credential and its skill track. */
import type { LocationAction } from '@fastlane/content';
import type { PlanCtx } from '../core/context.ts';
import { price } from '../economy/prices.ts';
import { transfer } from '../money/ledger.ts';
import { collectModifiers, scaleGain } from '../stats/stats.ts';
import type { Enrollment } from '../types/state.ts';
import {
  type ActionHandler,
  actionCause,
  applyPlan,
  durationOptions,
  fail,
  planFromData,
} from './common.ts';

/** Enrol, paying tuition in cash, or with `def.loan` on a student loan (FR-54). One course at a time. */
export const enroll: ActionHandler = {
  options: (ctx) => ctx.content.city.courses.map((c) => ({ target: c.id })),
  plan(ctx, def, params) {
    const { content, player, state } = ctx;
    const course = content.city.courses.find((c) => c.id === params.target);
    if (!course) return fail('BAD_TARGET');
    if (player.credentials.includes(course.id)) return fail('ALREADY_EARNED');
    if (player.enrollment) return fail('ALREADY_ENROLLED');
    if (def.loan && !course.loanEligible) return fail('NO_LOAN');
    const plan = planFromData(ctx, def, params);
    const tuition = price(state.world, course.tuition);
    if (def.loan) plan.transfers.push({ from: 'debt:student', to: 'outside', amount: tuition });
    else plan.money += tuition;
    return plan;
  },
  apply(ctx, def, plan, params) {
    const course = ctx.content.city.courses.find((c) => c.id === params.target);
    if (!course) throw new Error('unreachable: the plan checked the course');
    applyPlan(ctx, def, plan, { spend: 'tuition' });
    const loan = def.loan === true;
    for (const t of plan.transfers)
      transfer(ctx, ctx.player, t.from, t.to, t.amount, 'tuition', actionCause(def));
    ctx.player.enrollment = { course: course.id, minutes: 0 };
    ctx.emit({ type: 'enrolled', player: ctx.player.id, course: course.id, loan });
  },
};

/**
 * Drop the course you're enrolled in: no refund, and study done so far stays on its skill track but not toward the
 * credential. Frees you to enrol in something else (one course at a time).
 */
export const dropCourse: ActionHandler = {
  plan(ctx, def, params) {
    if (!ctx.player.enrollment) return fail('NOT_ENROLLED');
    return planFromData(ctx, def, params);
  },
  apply(ctx, def, plan) {
    const enrollment = ctx.player.enrollment;
    if (!enrollment) throw new Error('unreachable: the plan checked enrolment');
    applyPlan(ctx, def, plan);
    ctx.player.enrollment = null;
    ctx.emit({ type: 'courseDropped', player: ctx.player.id, course: enrollment.course });
  },
};

/** Minutes of study that just finish the enrolled course, given the study-output modifiers (FR-21). */
export function finishMinutes(
  ctx: PlanCtx,
  def: LocationAction,
  enrollment: Enrollment,
): number | null {
  const course = ctx.content.city.courses.find((c) => c.id === enrollment.course);
  if (!course) return null;
  const left = course.studyMinutes - enrollment.minutes;
  const modifiers = def.outputTarget
    ? collectModifiers(ctx.content, ctx.player, def.outputTarget)
    : [];
  let minutes = Math.max(1, left);
  while (scaleGain(minutes, modifiers) < left) minutes += 1;
  while (minutes > 1 && scaleGain(minutes - 1, modifiers) >= left) minutes -= 1;
  return minutes;
}

/**
 * Study toward the enrolled course. Study-output modifiers scale the progress (FR-21). A block longer than the
 * course needs is cut to what finishes it, so no time or energy is spent past the credential; the options offer
 * that exact length in place of the blocks that would overshoot.
 */
export const study: ActionHandler = {
  options(ctx, def) {
    const durations = def.durations ?? [];
    const enrollment = ctx.player.enrollment;
    const finish = enrollment ? finishMinutes(ctx, def, enrollment) : null;
    if (finish === null) return durationOptions(def);
    return [...durations.filter((m) => m < finish), finish].map((minutes) => ({ minutes }));
  },
  durations(ctx, def) {
    const enrollment = ctx.player.enrollment;
    const finish = enrollment ? finishMinutes(ctx, def, enrollment) : null;
    return finish === null ? [] : [finish];
  },
  plan(ctx, def, params) {
    const enrollment = ctx.player.enrollment;
    if (!enrollment) return fail('NOT_ENROLLED');
    const finish = finishMinutes(ctx, def, enrollment);
    const minutes = Math.min(params.minutes ?? def.minutes, finish ?? Number.POSITIVE_INFINITY);
    return planFromData(ctx, def, { ...params, minutes });
  },
  apply(ctx, def, plan) {
    const { player, content } = ctx;
    const enrollment = player.enrollment;
    if (!enrollment) throw new Error('unreachable: the plan checked enrolment');
    applyPlan(ctx, def, plan);
    const course = content.city.courses.find((c) => c.id === enrollment.course);
    if (!course) throw new Error(`unknown course ${enrollment.course}`);
    const progress = scaleGain(plan.time, plan.modifiers);
    enrollment.minutes += progress;
    player.trackMinutes[course.track] = (player.trackMinutes[course.track] ?? 0) + progress;
    if (enrollment.minutes >= course.studyMinutes) {
      player.credentials.push(course.id);
      player.enrollment = null;
      ctx.emit({ type: 'credentialEarned', player: player.id, course: course.id });
    }
  },
};
