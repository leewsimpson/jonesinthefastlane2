/**
 * Simulator content (simulator §3): bot personas as data, tuned like any balance value (NFR-15). A separate entry
 * point (`@fastlane/content/sim`) so the game never ships it.
 */
import { z } from 'zod';
import aiJson from '../data/ai.json' with { type: 'json' };
import kpiBandsJson from '../sim/kpi-bands.json' with { type: 'json' };
import personasJson from '../sim/personas.json' with { type: 'json' };
import { AiSchema, type Persona, PersonaSchema } from './hooks.ts';

export { type Persona, PersonaSchema };

/** Bot personas, then Jones's own (`jones-<difficulty>`), so the sim can play humans against every rival. */
export const personas: Persona[] = [
  ...z.array(PersonaSchema).parse(personasJson),
  ...AiSchema.parse(aiJson).rivals,
];

export function personaById(id: string): Persona {
  const persona = personas.find((p) => p.id === id);
  if (!persona)
    throw new Error(`unknown persona "${id}" (have: ${personas.map((p) => p.id).join(', ')})`);
  return persona;
}

const Range = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, 'min must be ≤ max');

/**
 * A KPI band (simulator §5): the agreed shape of the game, tuned like any balance value. Outside `hard` fails the
 * balance gate (CI-04); outside `soft` is a warning in the summary. Rates are basis points; weeks are weeks.
 */
export const KpiBandSchema = z.object({
  kpi: z.string().min(1),
  hard: Range,
  soft: Range.optional(),
  /** Why the band is where it is, and the run it came from. */
  note: z.string(),
});

export type KpiBand = z.infer<typeof KpiBandSchema>;

export const kpiBands: KpiBand[] = z.array(KpiBandSchema).parse(kpiBandsJson);
