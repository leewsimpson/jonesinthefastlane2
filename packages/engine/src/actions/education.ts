/** UpSkill U (§5): enrol in a course, study hours toward its credential and its skill track. */
import { price } from '../economy/prices.ts';
import { transfer } from '../money/ledger.ts';
import { scaleGain } from '../stats/stats.ts';
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
    if (!def.loan) plan.money += price(state.world, course.tuition);
    return plan;
  },
  apply(ctx, def, plan, params) {
    const course = ctx.content.city.courses.find((c) => c.id === params.target);
    if (!course) throw new Error('unreachable: the plan checked the course');
    applyPlan(ctx, def, plan, { spend: 'tuition' });
    const loan = def.loan === true;
    if (loan) {
      const tuition = price(ctx.world, course.tuition);
      transfer(ctx, ctx.player, 'debt:student', 'outside', tuition, 'tuition', actionCause(def));
    }
    ctx.player.enrollment = { course: course.id, minutes: 0 };
    ctx.emit({ type: 'enrolled', player: ctx.player.id, course: course.id, loan });
  },
};

/** Study toward the enrolled course. Study-output modifiers scale the progress (FR-21). */
export const study: ActionHandler = {
  options: (_ctx, def) => durationOptions(def),
  plan(ctx, def, params) {
    if (!ctx.player.enrollment) return fail('NOT_ENROLLED');
    return planFromData(ctx, def, params);
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
