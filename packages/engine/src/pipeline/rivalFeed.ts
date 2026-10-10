/**
 * R4: rival tension (ENG-13, ENG-14) and Jones's highlight reel (FR-82). After the goal check it reports everyone's
 * standing, who overtook whom and goals just short of their target, then each AI player posts about the best thing
 * in its own week and reacts to each human's milestones. Moments come from comparing this week's `WeekRecord` with
 * last week's, so the feed is a pure function of state; the lines themselves are copy (FR-84).
 */
import type { GameContent } from '@fastlane/content';
import { type FeedMoment, GOAL_KEYS } from '@fastlane/content/keys';
import type { RoundCtx } from '../core/context.ts';
import { goalValues, rawProgressBp } from '../goals/goals.ts';
import type { SlotParams as Params } from '../types/events.ts';
import type { GameState, PlayerId, PlayerState, WeekRecord } from '../types/state.ts';
import type { PipelineStep } from './types.ts';

interface Moment {
  moment: FeedMoment;
  params: Params;
}

/** The record a player would have had before week 1, so week-1 milestones count. */
function startRecord(
  content: GameContent,
  player: Readonly<PlayerState>,
  week: number,
): WeekRecord {
  const [home] = content.city.housing;
  return {
    week,
    player: player.id,
    cash: content.balance.startingStats.cash,
    netWorth: content.balance.startingStats.cash,
    progressBp: Object.fromEntries(GOAL_KEYS.map((g) => [g, 0])) as WeekRecord['progressBp'],
    scoreBp: 0,
    job: null,
    jobLevel: 0,
    housing: home?.id ?? '',
    credentials: 0,
    items: 0,
    questsDone: 0,
  };
}

/** This week's and last week's records for a player. */
function records(content: GameContent, state: Readonly<GameState>, player: Readonly<PlayerState>) {
  const now = state.history.findLast((r) => r.player === player.id && r.week === state.week);
  if (!now) throw new Error(`no record for ${player.id} in week ${state.week}`);
  const before =
    state.history.findLast((r) => r.player === player.id && r.week === state.week - 1) ??
    startRecord(content, player, state.week - 1);
  return { now, before };
}

const tier = (content: GameContent, id: string) =>
  content.city.housing.findIndex((h) => h.id === id);

/** A player's milestones this week, best first. */
function milestones(
  content: GameContent,
  player: Readonly<PlayerState>,
  now: WeekRecord,
  before: WeekRecord,
): Moment[] {
  const found: Moment[] = [];
  if (now.job && before.job && now.jobLevel > before.jobLevel)
    found.push({ moment: 'promoted', params: { job: now.job } });
  else if (now.job && now.job !== before.job)
    found.push({ moment: 'hired', params: { job: now.job } });
  const course = player.credentials.at(-1);
  if (now.credentials > before.credentials && course)
    found.push({ moment: 'credential', params: { course } });
  if (tier(content, now.housing) > tier(content, before.housing))
    found.push({ moment: 'moved-up', params: { home: now.housing } });
  const jump = now.netWorth - before.netWorth;
  if (jump >= content.balance.rival.netWorthJump)
    found.push({ moment: 'net-worth-up', params: { amount: jump } });
  if (now.questsDone > before.questsDone) found.push({ moment: 'quest-done', params: {} });
  const item = player.items.at(-1);
  if (now.items > before.items && item) found.push({ moment: 'bought', params: { item } });
  return found;
}

/** A setback worth a (gentle, punching-up) reaction: lost a job or moved down (FR-82, NFR-07). */
function setback(content: GameContent, now: WeekRecord, before: WeekRecord): boolean {
  return (
    (before.job !== null && now.job === null) ||
    tier(content, now.housing) < tier(content, before.housing)
  );
}

/** A week where nothing really moved: score, every goal and net worth all changed by less than the thresholds. */
function quiet(content: GameContent, now: WeekRecord, before: WeekRecord): boolean {
  const { quietBp, quietNetWorth } = content.balance.rival;
  return (
    Math.abs(now.scoreBp - before.scoreBp) < quietBp &&
    Math.abs(now.netWorth - before.netWorth) < quietNetWorth &&
    GOAL_KEYS.every((g) => Math.abs(now.progressBp[g] - before.progressBp[g]) < quietBp)
  );
}

const REACTIONS: Partial<Record<FeedMoment, FeedMoment>> = {
  promoted: 'react-promoted',
  hired: 'react-hired',
  credential: 'react-credential',
  'moved-up': 'react-moved-up',
};

export const rivalFeed: PipelineStep<RoundCtx> = {
  id: 'rival-feed',
  run(ctx) {
    const { state, content } = ctx;
    const { goals } = state.config;
    const { nearMissBp } = content.balance.rival;
    const recs = new Map<PlayerId, { now: WeekRecord; before: WeekRecord }>();
    for (const p of state.players) recs.set(p.id, records(content, state, p));
    const get = (id: PlayerId) => {
      const r = recs.get(id);
      if (!r) throw new Error(`no records for ${id}`);
      return r;
    };

    const scoresBp: Record<PlayerId, number> = {};
    const progressBp: Record<PlayerId, WeekRecord['progressBp']> = {};
    for (const p of state.players) {
      scoresBp[p.id] = get(p.id).now.scoreBp;
      progressBp[p.id] = { ...get(p.id).now.progressBp };
    }
    ctx.emit({ type: 'standings', week: state.week, scoresBp, progressBp });

    // Overtakes (ENG-14): b was not ahead of a last week and is now.
    for (const a of state.players)
      for (const b of state.players) {
        if (a === b) continue;
        const ra = get(a.id);
        const rb = get(b.id);
        if (rb.before.scoreBp <= ra.before.scoreBp && rb.now.scoreBp > ra.now.scoreBp)
          ctx.emit({ type: 'overtaken', player: a.id, by: b.id });
      }

    // Near misses (ENG-13): a goal entering the last stretch this week.
    for (const p of state.players) {
      const { before } = get(p.id);
      const values = goalValues(content, p);
      const raw = rawProgressBp(values, goals);
      for (const goal of GOAL_KEYS) {
        const bp = raw[goal];
        if (bp >= nearMissBp && bp < 10_000 && before.progressBp[goal] < nearMissBp)
          ctx.emit({
            type: 'nearMiss',
            player: p.id,
            goal,
            short: goals[goal] - values[goal],
            progressBp: bp,
            final: false,
          });
      }
    }

    // Jones's posts (FR-82): one about its own week, one reaction per human, and the rivalry beats.
    for (const ai of state.players) {
      if (ai.controller !== 'ai') continue;
      const own = get(ai.id);
      // A viral weekend card this week outranks any milestone: Jones spins all attention as a win.
      const viral = content.events.some(
        (e) => e.category === 'viral' && ai.seenEvents[e.id] === state.week,
      );
      const [best] = viral
        ? [{ moment: 'went-viral' as const, params: {} }]
        : milestones(content, ai, own.now, own.before);
      const post = (moment: FeedMoment, about: PlayerId | null, params: Params) =>
        ctx.emit({ type: 'rivalPost', player: ai.id, moment, about, params });
      if (best) post(best.moment, null, best.params);
      else post(quiet(content, own.now, own.before) ? 'quiet-week' : 'busy-week', null, {});
      for (const human of state.players) {
        if (human.controller !== 'human') continue;
        const theirs = get(human.id);
        const player = human.id;
        const reaction = milestones(content, human, theirs.now, theirs.before).find(
          (m) => REACTIONS[m.moment],
        );
        const react = reaction && REACTIONS[reaction.moment];
        if (reaction && react) post(react, player, { player, ...reaction.params });
        else if (setback(content, theirs.now, theirs.before))
          post('react-setback', player, { player });
        // The same test as `overtaken`, from Jones's side.
        if (own.before.scoreBp <= theirs.before.scoreBp && own.now.scoreBp > theirs.now.scoreBp)
          post('overtook', player, { player });
        else if (
          theirs.before.scoreBp <= own.before.scoreBp &&
          theirs.now.scoreBp > own.now.scoreBp
        )
          post('fell-behind', player, { player });
      }
    }
    return { done: true };
  },
};
