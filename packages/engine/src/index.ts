/**
 * Pure, deterministic game engine (tech-stack §2). No `Math.random`, `Date.now` or DOM access: `purity.test.ts`
 * enforces it. Content comes in as data (`@fastlane/content`); only its types are imported here.
 */
export const ENGINE_VERSION = '0.1.0';

export { loopDistance, travelCost } from './board.ts';
export {
  createEngine,
  type Engine,
  type EngineOptions,
  IllegalActionError,
  MAX_PLAYERS,
} from './engine.ts';
export { canonicalJson, hashValue } from './hash.ts';
export {
  defaultPipeline,
  type Pipeline,
  type PipelineStep,
  type PlayerStepContext,
  type RoundStepContext,
} from './pipeline.ts';
export { currentPlayer } from './preview.ts';
export {
  hashString,
  nextFloat,
  nextInt,
  nextUint32,
  type RngState,
  STREAMS,
  type StreamName,
  seedRng,
  streamSeed,
} from './rng.ts';
export {
  createSave,
  loadSave,
  SAVE_MIGRATIONS,
  SAVE_VERSION,
  SaveError,
  type SaveFile,
  type SaveMigration,
  type SaveMigrations,
  serializeSave,
  verifySave,
} from './save.ts';
export { applyDeltas, clamp, clampStat } from './stats.ts';
export type * from './types.ts';
