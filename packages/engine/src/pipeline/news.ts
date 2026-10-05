/**
 * R2: the news ticker (FR-72). Running stories count down; while fewer than `balance.news.maxActive` run, a new one
 * may break, drawn on the `world` stream, so every player gets the same headlines (NFR-12). A story's effects apply
 * from the next week (`hooks/news.ts`); one that names a market regime switches the market to it.
 */
import type { RoundCtx } from '../core/context.ts';
import type { PipelineStep } from './types.ts';

export const newsStep: PipelineStep<RoundCtx> = {
  id: 'news',
  run(ctx) {
    const { state, content } = ctx;
    const { world, week } = state;
    for (const story of world.news) story.weeksLeft -= 1;
    for (const story of world.news)
      if (story.weeksLeft <= 0) ctx.emit({ type: 'newsEnded', news: story.id });
    world.news = world.news.filter((s) => s.weeksLeft > 0);

    const rng = ctx.rng('world');
    const { chanceBp, maxActive } = content.balance.news;
    if (world.news.length >= maxActive || !rng.chance(chanceBp)) return { done: true };
    const pool = content.news.filter(
      (n) => !world.news.some((s) => s.id === n.id) && (n.minWeek ?? 0) <= week + 1,
    );
    if (pool.length === 0) return { done: true };
    const story = rng.pick(pool.map((n) => ({ weight: n.weight, value: n })));
    const weeks = rng.int(story.weeks.min, story.weeks.max);
    world.news.push({ id: story.id, since: week, weeksLeft: weeks });
    if (story.effects.regime) {
      world.regime = story.effects.regime;
      world.regimeWeeksLeft = weeks;
    }
    ctx.emit({ type: 'newsStarted', news: story.id, weeks });
    return { done: true };
  },
};
