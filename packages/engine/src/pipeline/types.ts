import type { PlayerCtx, RoundCtx } from '../core/context.ts';
import type { Decision } from '../types/state.ts';

/** A step either finishes or pauses for a player's choice (engine-design §11). */
export type StepResult = { done: true } | { pause: Decision };

export interface PipelineStep<Ctx> {
  id: string;
  run(ctx: Ctx): StepResult;
  /** Required for steps that pause. Called with the chosen option, then the pipeline continues. */
  resolve?(ctx: Ctx, decision: Decision, optionId: string): void;
}

/**
 * End-of-week processing in the fixed FR-05 order. Per-player steps run straight after each turn. Round steps run
 * once every player has played the week, so shared world state only changes between rounds (FR-05a). After the
 * round steps the engine always rolls over to the next week. Only per-player steps can pause.
 */
export interface Pipeline {
  perPlayer: PipelineStep<PlayerCtx>[];
  perRound: PipelineStep<RoundCtx>[];
}
