import type { GameContent } from '@fastlane/content';
import type { RngState, StreamName } from './rng.ts';
import { applyDeltas } from './stats.ts';
import type { GameEvent, GameState, PlayerState } from './types.ts';

export interface RoundStepContext {
  content: GameContent;
  /** A working copy: steps change it in place. */
  state: GameState;
  rng(stream: StreamName): RngState;
  emit(event: GameEvent): void;
}

export interface PlayerStepContext extends RoundStepContext {
  /** The player whose turn just ended. */
  player: PlayerState;
}

export interface PipelineStep<Ctx> {
  id: string;
  run(ctx: Ctx): void;
}

/**
 * End-of-week processing in the fixed FR-05 order. Per-player steps run straight after each turn. Round steps run
 * once every player has played the week, so shared world state only changes between rounds (FR-05a).
 */
export interface Pipeline {
  perPlayer: PipelineStep<PlayerStepContext>[];
  perRound: PipelineStep<RoundStepContext>[];
}

const stub = <Ctx>(id: string): PipelineStep<Ctx> => ({ id, run: () => {} });

export const foodCheck: PipelineStep<PlayerStepContext> = {
  id: 'food-check',
  run({ content, player, emit }) {
    if (player.fed) return;
    const changes = applyDeltas(content.balance, player.stats, content.balance.hungerPenalty);
    emit({ type: 'hungry', player: player.id, changes });
  },
};

/** Weekly sleep recovery and decay (Energy, Health, Social; Relationships join in Phase 9). */
export const statDrift: PipelineStep<PlayerStepContext> = {
  id: 'stat-drift',
  run({ content, player, emit }) {
    const changes = applyDeltas(content.balance, player.stats, content.balance.weeklyDrift);
    emit({ type: 'weeklyDrift', player: player.id, changes });
  },
};

export const defaultPipeline: Pipeline = {
  perPlayer: [
    foodCheck,
    stub('bills'), // Phase 2: rent, bills, subscriptions
    stub('interest-debt'), // Phase 2: interest and debt payments
    stub('job-checks'), // Phase 2: AI disruption
    statDrift,
    stub('weekend-event'), // Phase 3
    stub('quest-progress'), // Phase 3
  ],
  perRound: [
    stub('market'), // Phase 2
    stub('news'), // Phase 3
    stub('goal-check'), // Phase 2
    stub('teasers'), // Phase 3
  ],
};
