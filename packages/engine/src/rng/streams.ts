/**
 * Named random streams keyed by name, scope and week (engine-design §6). Keying by week means a content change that
 * draws one extra number in week 3 leaves week 4 alone. Keying by name means taking a gig never changes your weekend
 * event, and nothing a player does changes the `world` stream (NFR-12).
 */
import type { GameState, PlayerId } from '../types/state.ts';
import { cyrb128, type Rng, type RngState, rngFrom } from './rng.ts';

/**
 * Streams scoped to one player. `ai` is only used for AI players' decisions; `bills` for lease renewals; `events`
 * for weekend events; `quests` for issuing micro-goals.
 */
export const PLAYER_STREAMS = ['action', 'job', 'bills', 'events', 'quests', 'ai'] as const;
export type PlayerStream = (typeof PLAYER_STREAMS)[number];

/** e.g. `world::12`, `events:p1:12`. */
export function streamKey(
  name: PlayerStream | 'world',
  scope: PlayerId | '',
  week: number,
): string {
  return `${name}:${scope}:${week}`;
}

/** The generator for a stream in the current week, created from the run seed on first use and kept in state. */
export function stream(state: GameState, key: string): Rng {
  let s: RngState | undefined = state.rng[key];
  if (!s) {
    s = cyrb128(`${state.seed}|${key}`);
    state.rng[key] = s;
  }
  return rngFrom(s);
}
