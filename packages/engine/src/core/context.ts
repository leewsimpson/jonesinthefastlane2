/**
 * What each kind of engine code may see and change. The shapes enforce the rules: plans get no RNG (previews never
 * consume it), and player-scoped code gets the world read-only (FR-05a).
 */
import type { GameContent } from '@fastlane/content';
import type { Rng } from '../rng/rng.ts';
import type { PlayerStream } from '../rng/streams.ts';
import type { DomainEvent } from '../types/events.ts';
import type { GameConfig, GameState, PlayerState, WorldState } from '../types/state.ts';

export interface Emitter {
  content: GameContent;
  emit(event: DomainEvent): void;
}

/** For `plan`: pure, read-only, no RNG. */
export interface PlanCtx {
  content: GameContent;
  state: Readonly<GameState>;
  player: Readonly<PlayerState>;
}

/** For handler `apply` and per-player pipeline steps. */
export interface PlayerCtx extends Emitter {
  week: number;
  config: Readonly<GameConfig>;
  player: PlayerState;
  world: Readonly<WorldState>;
  /** The stream for this player and week. */
  rng(name: PlayerStream): Rng;
  /** A fresh instance id, e.g. `decision-3`. */
  newId(prefix: string): string;
}

/** For per-round pipeline steps: the only code that may change the world. */
export interface RoundCtx extends Emitter {
  state: GameState;
  rng(name: 'world'): Rng;
}
