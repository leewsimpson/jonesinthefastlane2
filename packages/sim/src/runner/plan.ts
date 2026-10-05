/**
 * Run plans: which matchups a run plays and how its games are shared between them (simulator §5, §8). Every
 * matchup's game `i` uses seed `<run seed>-<i>`, so the same games recur across matchups and runs, and two reports
 * can be compared game by game (common random numbers, simulator §7).
 */
import type { Difficulty } from '@fastlane/content';
import type { GameJob } from './pool.ts';
import type { Matchup } from './record.ts';

const WEEKS = 52;

const vsJones = (bot: string, difficulty: Difficulty, weight: number) => ({
  matchup: {
    id: `${bot}-${difficulty}`,
    bots: [bot],
    jones: difficulty,
    difficulty,
    weekLimit: WEEKS,
  } satisfies Matchup,
  weight,
});

/**
 * The balance gate (CI-04): the reference persona against every Jones, each one-goal persona and the floors against
 * Standard Jones, and two balanced humans for seat fairness.
 */
export const CI_PLAN = [
  vsJones('balanced', 'standard', 6),
  vsJones('balanced', 'chill', 2),
  vsJones('balanced', 'hustle-culture', 2),
  vsJones('careerist', 'standard', 1),
  vsJones('scholar', 'standard', 1),
  vsJones('saver', 'standard', 1),
  vsJones('socialite', 'standard', 1),
  vsJones('gambler', 'standard', 1),
  vsJones('spender', 'standard', 1),
  vsJones('casual', 'chill', 1),
  vsJones('gigger', 'standard', 1),
  vsJones('idle', 'standard', 1),
  vsJones('random', 'standard', 1),
  {
    matchup: {
      id: 'balanced-pair-standard',
      bots: ['balanced', 'balanced'],
      jones: null,
      difficulty: 'standard',
      weekLimit: WEEKS,
    } satisfies Matchup,
    weight: 2,
  },
];

export type MatchupPlan = typeof CI_PLAN;

/** `games` shared out by weight, at least one game per matchup. */
export function jobsFor(plan: MatchupPlan, games: number, seed: string): GameJob[] {
  const total = plan.reduce((sum, m) => sum + m.weight, 0);
  const jobs: GameJob[] = [];
  for (const { matchup, weight } of plan) {
    const n = Math.max(1, Math.round((games * weight) / total));
    for (let i = 0; i < n; i++) jobs.push({ matchup, seed: `${seed}-${i}` });
  }
  return jobs;
}
