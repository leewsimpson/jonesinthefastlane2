/**
 * What the running news stories change (FR-72). Stories live in `world.news`; each effect is summed over them and
 * added to the usual value where it's used, so the news ticker is data, not special cases.
 */
import type { GameContent, News, NewsEffects } from '@fastlane/content';
import type { WorldState } from '../types/state.ts';

type NumericEffect = {
  [K in keyof NewsEffects]-?: NewsEffects[K] extends number ? K : never;
}[keyof NewsEffects];

export function newsById(content: GameContent, id: string): News {
  const story = content.news.find((n) => n.id === id);
  if (!story) throw new Error(`unknown news ${id}`);
  return story;
}

/** The sum of one numeric effect over every story running now. */
export function newsEffect(
  content: GameContent,
  world: Readonly<WorldState>,
  key: NumericEffect,
): number {
  let total = 0;
  for (const active of world.news) total += newsById(content, active.id).effects[key];
  return total;
}

/** Extra AI exposure for jobs on `ladder` from the stories running now, in basis points. */
export function newsExposure(
  content: GameContent,
  world: Readonly<WorldState>,
  ladder: string,
): number {
  let total = 0;
  for (const active of world.news)
    for (const x of newsById(content, active.id).effects.exposure)
      if (x.ladder === ladder) total += x.bp;
  return total;
}
