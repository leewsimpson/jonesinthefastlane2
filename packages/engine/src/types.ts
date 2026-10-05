import type { StatKey } from '@fastlane/content/keys';
import type { RngState, StreamName } from './rng.ts';

export type Stats = Record<StatKey, number>;

export interface PlayerSetup {
  name: string;
  /** AI players play by the same rules (FR-80). The rival's decision-making arrives in Phase 3. */
  kind: 'human' | 'ai';
}

export interface GameSetup {
  /** Run seed. Every random stream is derived from it (NFR-12). */
  seed: string;
  /** In turn order. 1–4 humans plus optional AI rivals (FR-06). */
  players: PlayerSetup[];
}

export interface PlayerState {
  id: string;
  name: string;
  kind: 'human' | 'ai';
  location: string;
  /** Discretionary hours left this week (FR-01). */
  hoursLeft: number;
  stats: Stats;
  /** Whether the player ate this week. The food check penalises `false` (§4 Hunger). */
  fed: boolean;
  /** Owned item ids. Items arrive in Phase 2; transport modes can already require one. */
  items: string[];
}

export interface GameState {
  seed: string;
  /** Calendar week, starting at 1. */
  week: number;
  /** Index into `players` of whoever is taking their turn. Everyone plays the same week in sequence (FR-05a). */
  turn: number;
  players: PlayerState[];
  /** Generator state per stream, created on first use. */
  rng: Partial<Record<StreamName, RngState>>;
}

/** Everything a player can submit. Actions always apply to the current player. */
export type GameAction =
  | { type: 'travel'; to: string; mode: string }
  | { type: 'perform'; action: string }
  | { type: 'endWeek' };

export type StatChanges = Partial<Record<StatKey, number>>;

export type TurnEndReason = 'endWeek' | 'outOfTime' | 'burnout';

/** Domain events. The UI turns these into presentation (tech-stack §2). */
export type GameEvent =
  | {
      type: 'travelled';
      player: string;
      from: string;
      to: string;
      mode: string;
      hours: number;
      changes: StatChanges;
    }
  | { type: 'performed'; player: string; action: string; hours: number; changes: StatChanges }
  | { type: 'burnout'; player: string }
  | { type: 'restBonus'; player: string; hours: number; changes: StatChanges }
  | { type: 'turnEnded'; player: string; reason: TurnEndReason }
  | { type: 'hungry'; player: string; changes: StatChanges }
  | { type: 'weeklyDrift'; player: string; changes: StatChanges }
  | { type: 'roundEnded'; week: number }
  | { type: 'weekStarted'; week: number }
  | { type: 'turnStarted'; player: string; week: number };

export type Blocker =
  | 'unknownLocation'
  | 'unknownMode'
  | 'unknownAction'
  | 'alreadyThere'
  | 'wrongLocation'
  | 'needsItem'
  | 'notEnoughTime'
  | 'notEnoughCash';

/** A visible modifier on an action (FR-21), e.g. "−20% output: low energy". */
export interface Modifier {
  id: 'lowEnergy';
  multiplier: number;
}

/** What an action would do, worked out without touching state or RNG (FR-03). */
export interface ActionPreview {
  action: GameAction;
  hours: number;
  cost: number;
  /** Stat deltas before clamping to stat ranges. Rolled effects show their range. `cash` is net of the cost. */
  effects: Partial<Record<StatKey, { min: number; max: number }>>;
  modifiers: Modifier[];
  /** Why the action can't be taken. Empty means it's legal. */
  blockers: Blocker[];
}

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}
