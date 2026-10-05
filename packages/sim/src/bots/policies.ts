/** Bots from engine policies (simulator §3): random, idle, and the utility scorer with a persona. */
import type { GameContent } from '@fastlane/content';
import type { Persona } from '@fastlane/content/sim';
import { type AiPolicy, createRng, randomPolicy, utilityPolicy } from '@fastlane/engine';
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
