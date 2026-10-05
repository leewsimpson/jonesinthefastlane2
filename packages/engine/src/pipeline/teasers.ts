/**
 * The last round step: next-week teasers (ENG-10), the "one more week" hook. Each is read off state that will matter
 * next week (a lease about to renew, a layoff warning, a credential nearly done, Jones closing in), so teasers never
 * promise anything the rules won't deliver. Human players get them in `TEASERS` priority order; the UI shows the
 * first one or two.
 */
import type { GameContent } from '@fastlane/content';
import { DEBT_KINDS, TEASERS, type TeaserId } from '@fastlane/content/keys';
import type { RoundCtx } from '../core/context.ts';
import { jobById, nextOnLadder, qualification } from '../jobs/jobs.ts';
import type { GameState, PlayerState } from '../types/state.ts';
import { questById, questProgressBp } from './quests.ts';
import type { PipelineStep } from './types.ts';

type Params = Record<string, string | number>;

/** Every teaser that applies to `player`, in priority order. */
export function teasersFor(
  content: GameContent,
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
): { teaser: TeaserId; params: Params }[] {
  const { balance } = content;
  const weeks = state.config.turnLengthWeeks;
  const found: Partial<Record<TeaserId, Params>> = {};
  const { job, housing } = player;

  if (job?.layoffWarning) found.layoff = { job: job.id };
  if (housing.missedRent > 0 && housing.missedRent === balance.housing.evictAfterMissed - 1)
    found['eviction-risk'] = { owed: player.debts.arrears.balance };
  for (const kind of DEBT_KINDS) {
    const debt = player.debts[kind];
    if (
      debt.missed > 0 &&
      !debt.collections &&
      debt.missed === balance.finance.collectionsAfter - 1
    )
      found['collections-risk'] ??= { debt: kind };
  }
  if (housing.rent > 0 && housing.leaseWeeksLeft <= weeks)
    found['lease-renewal'] = { rent: housing.rent };

  const myScore = state.history.findLast((r) => r.player === player.id && r.week === state.week);
  for (const other of state.players) {
    if (other.controller !== 'ai' || !myScore) continue;
    const theirs = state.history.findLast((r) => r.player === other.id && r.week === state.week);
    if (theirs && theirs.scoreBp >= myScore.scoreBp - balance.rival.closeBp) {
      found['rival-close'] = { rival: other.id };
      break;
    }
  }

  if (job && !job.layoffWarning) {
    const next = nextOnLadder(content, jobById(content, job.id));
    if (next) {
      const why = qualification(content, player, next);
      const experienceLeft = next.minExperience - (player.experience[next.ladder] ?? 0);
      const ready =
        why === null ||
        (why === 'NEEDS_EXPERIENCE' && experienceLeft <= balance.jobs.maxWeeklyMinutes);
      if (ready && job.rating >= balance.jobs.promotionRating - 10)
        found['promotion-close'] = { job: next.id };
    }
  }
  const enrollment = player.enrollment;
  if (enrollment) {
    const course = content.city.courses.find((c) => c.id === enrollment.course);
    const left = course ? course.studyMinutes - enrollment.minutes : 0;
    if (course && left > 0 && left <= 600)
      found['credential-close'] = { course: course.id, hours: Math.ceil(left / 60) };
  }
  for (const active of player.quests) {
    const quest = questById(content, active.id);
    if (
      active.deadline === state.week + 1 &&
      questProgressBp(content, player, quest.goal, active.baseline) < 10_000
    ) {
      found['quest-deadline'] = { quest: quest.id };
      break;
    }
  }
  const breaking = state.world.news.find((n) => n.since === state.week);
  if (breaking) found.news = { news: breaking.id };
  if (player.gigBanWeeks > 0 && player.gigBanWeeks <= weeks) found['gig-back'] = {};

  const list = (Object.keys(TEASERS) as TeaserId[]).flatMap((teaser) => {
    const params = found[teaser];
    return params ? [{ teaser, params }] : [];
  });
  const rival = state.players.find((p) => p.controller === 'ai');
  if (list.length === 0 && rival) list.push({ teaser: 'next-week', params: { rival: rival.id } });
  return list;
}

export const teasers: PipelineStep<RoundCtx> = {
  id: 'teasers',
  run(ctx) {
    const { state, content } = ctx;
    for (const player of state.players) {
      if (player.controller !== 'human') continue;
      for (const { teaser, params } of teasersFor(content, state, player))
        ctx.emit({ type: 'teaser', player: player.id, teaser, params });
    }
    return { done: true };
  },
};
