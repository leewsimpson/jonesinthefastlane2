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

/** Engine handler for an action definition (engine-design §8.2). Phase 2 adds work, study, buy and banking kinds. */
export const ACTION_KINDS = ['basic', 'eat'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Quantities a modifier can scale (engine-design §8.3, FR-21). */
export const MODIFIER_TARGETS = ['workOutput', 'studyOutput', 'travelTime'] as const;
export type ModifierTarget = (typeof MODIFIER_TARGETS)[number];
