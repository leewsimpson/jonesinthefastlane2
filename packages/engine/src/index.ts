/**
 * Pure, deterministic game engine (engine-design.md). No `Math.random`, `Date` or DOM access: `purity.test.ts`
 * enforces it. Content comes in as data through `createEngine`; only its types are imported here. Saves are a
 * separate entry point, `@fastlane/engine/save`.
 */
export { type SmartDefault, type SmartKind, smartDefaults } from './actions/smart.ts';
export { type AiPolicy, randomPolicy } from './ai/random.ts';
export {
  type Persona,
  rivalPolicy,
  type ScoredOption,
  scoreChoices,
  scoreOptions,
  utilityPolicy,
  valuation,
} from './ai/utility.ts';
export type { PlayerCtx, RoundCtx } from './core/context.ts';
export { canonicalJson, hashValue } from './core/hash.ts';
export {
  createEngine,
  DEFAULT_CONFIG,
  type Engine,
  type EngineOptions,
  MAX_HUMANS,
  ReplayError,
  resolveConfig,
} from './core/reduce.ts';
export {
  careerValue,
  type GoalValues,
  goalValues,
  hasWon,
  netWorth,
  overshootBp,
  progressBp,
  scoreBp,
  skillsValue,
  wellbeing,
} from './goals/goals.ts';
export { meets } from './hooks/conditions.ts';
export { newsEffect, newsExposure } from './hooks/news.ts';
export { effectiveExposure, qualification, weeklyCap } from './jobs/jobs.ts';
export { balanceOf, financialNetWorth, type Place, places, totalDebt } from './money/ledger.ts';
export { scores } from './pipeline/goalCheck.ts';
export { defaultPipeline } from './pipeline/order.ts';
export { questMeasure, questProgressBp } from './pipeline/quests.ts';
export { teasersFor } from './pipeline/teasers.ts';
export type { Pipeline, PipelineStep, StepResult } from './pipeline/types.ts';
export { choicePlan } from './pipeline/weekendEvent.ts';
export { createRng, type Rng } from './rng/rng.ts';
export { skillPoints } from './stats/stats.ts';
export type * from './types/actions.ts';
export type * from './types/events.ts';
export { EXTERNAL_FLOWS, INTERNAL_FLOWS } from './types/events.ts';
export type * from './types/state.ts';
export { ENGINE_VERSION } from './version.ts';
