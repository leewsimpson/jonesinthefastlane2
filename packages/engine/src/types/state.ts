/**
 * Game state (engine-design §4). Plain JSON only: no classes, `Map`, `Set`, `undefined` values, functions or cycles,
 * so it clones, hashes, stores and crosses the Worker boundary as-is. Money is integer cents and time is integer
 * minutes (§5); field names carry the unit.
 */
import type { StatKey } from '@fastlane/content/keys';
import type { RngState } from '../rng/rng.ts';

/** `p1`, `p2`, … Never integer-like, so `Record` key order stays insertion order. */
export type PlayerId = string;
export type Stats = Record<StatKey, number>;
export type Controller = 'human' | 'ai';

export interface PlayerSetup {
  name: string;
  /** AI players play by the same rules (FR-80). The engine plays their turns (engine-design §7). */
  controller: Controller;
}

export interface GameConfig {
  /** The game ends after this week's round, or never if null (FR-12). */
  weekLimit: number | null;
  /** Weeks per turn. Long Life (FR-91) raises it; Phase 1 only carries the field. */
  turnLengthWeeks: number;
}

export interface GameSetup {
  /** Run seed. Every random stream is derived from it (NFR-12). */
  seed: string;
  /** In turn order. 1–4 humans plus optional AI rivals (FR-06). */
  players: PlayerSetup[];
  /** Missing fields take the defaults in `newGame`. */
  config?: Partial<GameConfig>;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  controller: Controller;
  location: string;
  /** Discretionary minutes left this week (FR-01). */
  timeLeft: number;
  /** `cash` is in cents. `wardrobe` is an index into `balance.wardrobeTiers`. */
  stats: Stats;
  /** The food check penalises 0 (§4 Hunger). */
  mealsThisWeek: number;
  /** Owned item ids. Items arrive in Phase 2; transport modes can already require one. */
  items: string[];
}

/** Shared economy state. Only per-round steps may change it (FR-05a). Prices, market and news arrive in Phase 2–3. */
export type WorldState = Record<string, never>;

/** A choice a pipeline step needs from a player before it can finish (engine-design §11). */
export interface Decision {
  id: string;
  player: PlayerId;
  /** The step that asked, and that resolves it. */
  stepId: string;
  /** Option ids. Copy key: `decision.<stepId>.<option>`. */
  options: string[];
}

export type GameResult = { reason: 'weekLimit'; week: number };

export type Phase =
  | { kind: 'turn'; player: PlayerId }
  | { kind: 'endOfTurn'; player: PlayerId; step: number }
  | { kind: 'endOfRound'; step: number }
  | { kind: 'gameOver'; result: GameResult };

/** Per-player, per-week numbers for the run summary. Events aren't saved, so anything needed later goes here. */
export interface WeekRecord {
  week: number;
  player: PlayerId;
  cash: number;
}

export interface GameState {
  /** Bump with a save migration when this shape changes. */
  schemaVersion: number;
  seed: string;
  config: GameConfig;
  /** Calendar week, starting at 1, shared by all players (FR-05a). */
  week: number;
  phase: Phase;
  /** In turn order. */
  players: PlayerState[];
  world: WorldState;
  /** Live generator state for the streams used this week, keyed by stream key (engine-design §6). */
  rng: Record<string, RngState>;
  /** Set while a human must `decide` before the pipeline can continue. */
  pending: Decision | null;
  /** Counter for new instance ids, so ids never come from time or randomness. */
  nextId: number;
  history: WeekRecord[];
}
