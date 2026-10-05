/**
 * Pure, deterministic game engine (engine-design.md). No `Math.random`, `Date` or DOM access: `purity.test.ts`
 * enforces it. Content comes in as data through `createEngine`; only its types are imported here. Saves are a
 * separate entry point, `@fastlane/engine/save`.
 */
export type { AiPolicy } from './ai/random.ts';
export type { PlayerCtx, RoundCtx } from './core/context.ts';
export { canonicalJson, hashValue } from './core/hash.ts';
export {
  createEngine,
  DEFAULT_CONFIG,
  type Engine,
  type EngineOptions,
  MAX_HUMANS,
  ReplayError,
} from './core/reduce.ts';
export { defaultPipeline } from './pipeline/order.ts';
export type { Pipeline, PipelineStep, StepResult } from './pipeline/types.ts';
export { createRng, type Rng } from './rng/rng.ts';
export type * from './types/actions.ts';
export type * from './types/events.ts';
export type * from './types/state.ts';
export { ENGINE_VERSION } from './version.ts';
