/**
 * Simulator content (simulator §3): bot personas as data, tuned like any balance value (NFR-15). A separate entry
 * point (`@fastlane/content/sim`) so the game never ships it.
 */
import { z } from 'zod';
import personasJson from '../sim/personas.json' with { type: 'json' };
import { GOAL_KEYS } from './keys.ts';

const Bp = z.number().int().min(0).max(10_000);

/** A utility-bot persona: one scorer, different weights (simulator §3). */
export const PersonaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    /** How much each goal's progress is worth. Sums to 10 000. */
    goalWeightsBp: z.record(z.enum(GOAL_KEYS), Bp),
    /** 5000 is neutral; higher likes volatile assets, lower avoids them. */
    riskAppetiteBp: Bp,
    /** Weeks ahead the bot values ongoing income, costs and buffs. */
    horizonWeeks: z.number().int().positive(),
    /** How often the bot takes its top-scored move (FR-83); otherwise one of its top few. */
    bestMoveRateBp: Bp,
    notes: z.string(),
  })
  .refine(
    (p) => GOAL_KEYS.reduce((sum, k) => sum + p.goalWeightsBp[k], 0) === 10_000,
    'goal weights must sum to 10 000',
  );

export type Persona = z.infer<typeof PersonaSchema>;

export const personas: Persona[] = z.array(PersonaSchema).parse(personasJson);

export function personaById(id: string): Persona {
  const persona = personas.find((p) => p.id === id);
  if (!persona)
    throw new Error(`unknown persona "${id}" (have: ${personas.map((p) => p.id).join(', ')})`);
  return persona;
}
