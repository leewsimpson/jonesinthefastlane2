/**
 * Zod schema for a stored save (engine-design §14). It checks the envelope, the setup and the action log exactly,
 * and the snapshot's top-level shape: the engine owns the full state shape, and a migration (not this schema) is what
 * keeps old snapshots usable.
 */
import { z } from 'zod';

const PlayerSetupSchema = z.object({
  name: z.string(),
  controller: z.enum(['human', 'ai']),
  persona: z.string().optional(),
});

const SetupSchema = z.object({
  seed: z.string(),
  players: z.array(PlayerSetupSchema).min(1),
  config: z
    .object({
      weekLimit: z.number().int().positive().nullable().optional(),
      turnLengthWeeks: z.number().int().positive().optional(),
      difficulty: z.string().optional(),
      goals: z.record(z.string(), z.number().int()).optional(),
    })
    .optional(),
});

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('travel'), to: z.string(), mode: z.string() }),
  z.object({
    type: z.literal('perform'),
    actionId: z.string(),
    target: z.string().optional(),
    minutes: z.number().int().optional(),
    amount: z.number().int().optional(),
  }),
  z.object({ type: z.literal('endWeek') }),
  z.object({ type: z.literal('decide'), decisionId: z.string(), optionId: z.string() }),
]);

const SnapshotSchema = z.looseObject({
  schemaVersion: z.number().int(),
  seed: z.string(),
  week: z.number().int().positive(),
  phase: z.looseObject({ kind: z.enum(['turn', 'endOfTurn', 'endOfRound', 'gameOver']) }),
  players: z.array(z.looseObject({ id: z.string(), name: z.string() })).min(1),
  world: z.looseObject({}),
  config: z.looseObject({}),
  history: z.array(z.unknown()),
});

export const SaveFileSchema = z.object({
  format: z.literal('fastlane-save'),
  saveVersion: z.number().int(),
  engineVersion: z.string(),
  contentHash: z.string(),
  setup: SetupSchema,
  log: z.array(ActionSchema),
  snapshot: SnapshotSchema,
  snapshotHash: z.string(),
});

/**
 * A game to watch on the debug replay route (simulator §4): `{ setup, log }` from `pnpm sim trace --replay`. A save
 * file has both fields too, so a player's save loads as is.
 */
export const ReplayFileSchema = z.object({ setup: SetupSchema, log: z.array(ActionSchema) });
