/** Zod-free constants shared with the engine, so importing them never pulls Zod or content JSON into a bundle. */

/** Player stats with a numeric value (FR-20). Time is the weekly budget and is tracked separately. */
export const STAT_KEYS = [
  'cash',
  'energy',
  'health',
  'happiness',
  'social',
  'creditScore',
  'wardrobe',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const ACTION_TAGS = ['eat', 'rest', 'output', 'social'] as const;
export type ActionTag = (typeof ACTION_TAGS)[number];
