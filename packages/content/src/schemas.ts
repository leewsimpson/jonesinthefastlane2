import { z } from 'zod';

/** Top-level content manifest. Later phases add schemas for cities, jobs, items and events (FR-74, NFR-15). */
export const MetaSchema = z.object({
  contentVersion: z.number().int().positive(),
  defaultCity: z.string().min(1),
});

export type Meta = z.infer<typeof MetaSchema>;
