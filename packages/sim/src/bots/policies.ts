/** Bots from engine policies (simulator §3): random, idle, and the utility scorer with a persona. */
import type { GameContent } from '@fastlane/content';
import type { Persona } from '@fastlane/content/sim';
import {
  type Action,
  type AiPolicy,
  createRng,
  randomPolicy,
  utilityPolicy,
} from '@fastlane/engine';
import type { Bot } from '../game.ts';

/**
 * Wrap an engine policy as a bot. Its randomness comes from its own generator, seeded from the game seed, never
 * from the game's streams (simulator §2).
 */
export function policyBot(id: string, policy: AiPolicy, seed: string): Bot {
  const rng = createRng(`${seed}|bot:${id}`);
  return {
    id,
    choose(engine, state) {
      if (state.pending)
        return {
          type: 'decide',
          decisionId: state.pending.id,
          optionId: policy.chooseOption(state.pending, rng, state),
        };
      const options = engine.listActions(state).filter((o) => o.available);
      return policy.chooseAction(options, rng, state);
    },
  };
}

export const randomBot = (seed: string): Bot => policyBot('random', randomPolicy, seed);

/** Ends the week at once, every week: proves the no-softlock floor (FR-14). */
export const idleBot: Bot = {
  id: 'idle',
  choose: (_engine, state) =>
    state.pending
      ? { type: 'decide', decisionId: state.pending.id, optionId: state.pending.options[0] ?? '' }
      : { type: 'endWeek' },
};

export const personaBot = (content: GameContent, persona: Persona, seed: string): Bot =>
  policyBot(persona.id, utilityPolicy(content, persona), seed);

/**
 * Only works GigHub (simulator §3): eats at home, gigs until the week runs out or Energy runs low, and never takes
 * a job, a course or a lease. Gig work must be a floor, not a winning strategy (FR-44).
 */
export function giggerBot(content: GameContent): Bot {
  const { city } = content;
  const gig = city.actions.find((a) => a.kind === 'gig');
  const meal = city.actions.find((a) => a.kind === 'eat' && a.location === city.board.home);
  if (!gig || !meal) throw new Error('the gigger needs a gig and a meal at home');
  const durations = [...(gig.durations ?? [gig.minutes])].sort((a, b) => b - a);
  return {
    id: 'gigger',
    choose(engine, state) {
      if (state.pending)
        return {
          type: 'decide',
          decisionId: state.pending.id,
          optionId: state.pending.options[0] ?? '',
        };
      const me = state.players.find(
        (p) => state.phase.kind === 'turn' && p.id === state.phase.player,
      );
      const tryAction = (action: Action) =>
        engine.preview(state, action).available ? action : null;
      if (me && me.mealsThisWeek === 0) {
        const eat = tryAction({ type: 'perform', actionId: meal.id });
        if (eat) return eat;
      }
      if (me && me.stats.energy > 30)
        for (const minutes of durations) {
          const shift = tryAction({ type: 'perform', actionId: gig.id, minutes });
          if (shift) return shift;
        }
      return { type: 'endWeek' };
    },
  };
}
