/**
 * Game state (engine-design §4). Plain JSON only: no classes, `Map`, `Set`, `undefined` values, functions or cycles,
 * so it clones, hashes, stores and crosses the Worker boundary as-is. Money is integer cents and time is integer
 * minutes (§5); field names carry the unit.
 */
import type { DebtKind, Difficulty, GoalKey, StatKey } from '@fastlane/content/keys';
import type { RngState } from '../rng/rng.ts';
import type { Plan } from './actions.ts';

/** `p1`, `p2`, … Never integer-like, so `Record` key order stays insertion order. */
export type PlayerId = string;
export type Stats = Record<StatKey, number>;
export type Controller = 'human' | 'ai';

export interface PlayerSetup {
  name: string;
  /** AI players play by the same rules (FR-80). The engine plays their turns (engine-design §7). */
  controller: Controller;
  /**
   * An AI player's persona id from `content.ai.rivals`. Defaults to the rival for the game's difficulty (FR-83).
   * Ignored for humans.
   */
  persona?: string;
}

/** Goal targets (§3, FR-10). Wealth is in cents. */
export type GoalTargets = Record<GoalKey, number>;

export interface GameConfig {
  /** The game ends after this week's round, or never if null (FR-12). */
  weekLimit: number | null;
  /** Weeks per turn. Long Life (FR-91) raises it; recurring charges and interest multiply by it. */
  turnLengthWeeks: number;
  /** A preset, or `custom` when the setup gave its own targets (FR-10). */
  difficulty: Difficulty | 'custom';
  goals: GoalTargets;
}

export interface GameSetup {
  /** Run seed. Every random stream is derived from it (NFR-12). */
  seed: string;
  /** In turn order. 1–4 humans plus optional AI rivals (FR-06). */
  players: PlayerSetup[];
  /**
   * Missing fields take the defaults in `newGame`. `difficulty` picks preset targets; `goals` alone means custom
   * targets.
   */
  config?: Partial<GameConfig>;
}

/** The player's current job (FR-40). */
export interface JobState {
  id: string;
  /** Wage multiplier after restructures (FR-42), 10 000 = ×1. */
  wageBp: number;
  /** Weekly hours cap multiplier after hours cuts (FR-42). */
  hoursCapBp: number;
  /** 0–100. Promotions need it (FR-43); at 0 the player is let go. */
  rating: number;
  minutesThisWeek: number;
  /** A layoff is coming at the next job check (FR-42's one-week warning). */
  layoffWarning: boolean;
}

export interface Enrollment {
  course: string;
  /** Study minutes done, after study-output modifiers. */
  minutes: number;
}

export interface HousingState {
  tier: string;
  /** Weekly rent in cents, locked for the lease (FR-51). */
  rent: number;
  leaseWeeksLeft: number;
  /** Held by LeaseLord; returned on moving out, kept against arrears on eviction. */
  deposit: number;
  /** Consecutive weeks of rent not paid in full (FR-14). */
  missedRent: number;
}

/** A debt (FR-54). `balance` is cents owed. */
export interface Debt {
  balance: number;
  /** Consecutive weeks the payment due was missed. */
  missed: number;
  collections: boolean;
}

/** A micro-goal on the go (ENG-11). `baseline` is the measure when it was issued; progress is the change. */
export interface ActiveQuest {
  id: string;
  /** The last week it can be finished in. */
  deadline: number;
  baseline: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  controller: Controller;
  /** The AI persona that plays this seat (FR-83), or null for humans. */
  persona: string | null;
  location: string;
  /** Discretionary minutes left this week (FR-01). */
  timeLeft: number;
  /** `cash` is in cents. `wardrobe` is an index into `balance.wardrobeTiers`. */
  stats: Stats;
  /** The food check penalises 0 (§4 Hunger). */
  mealsThisWeek: number;
  /** Owned item ids, in purchase order. */
  items: string[];
  /** Stored grocery meals (FR-60: groceries need a fridge). */
  pantryMeals: number;
  job: JobState | null;
  /** Minutes worked per career ladder (FR-43). Gig work doesn't count (FR-44). */
  experience: Record<string, number>;
  /** Weeks left of a GigHub deactivation (FR-44). */
  gigBanWeeks: number;
  enrollment: Enrollment | null;
  /** Earned credential (course) ids. */
  credentials: string[];
  /** Study minutes per skill track (§3 Skills). */
  trackMinutes: Record<string, number>;
  housing: HousingState;
  /** Cents held in savings and each market asset (FR-53). */
  holdings: Record<string, number>;
  debts: Record<DebtKind, Debt>;
  /** Active subscription ids (FR-52). */
  subscriptions: string[];
  /** The last turn ended at 0 Energy: the weekend event is a burnout card (§4 Energy). */
  burnout: boolean;
  /** Minutes added to (or taken from) next week's time budget by a weekend event. */
  nextWeekMinutes: number;
  /** The week each weekend event was last drawn, for cooldowns. */
  seenEvents: Record<string, number>;
  /** Micro-goals on the go (ENG-11). */
  quests: ActiveQuest[];
  /** The week each quest was last finished or failed, for cooldowns. */
  seenQuests: Record<string, number>;
  /** Quests finished so far. */
  questsDone: number;
}

/** Shared economy state. Only per-round steps may change it (FR-05a). */
export interface WorldState {
  /** Price index, 10 000 = launch prices (FR-50). Scales prices, rents, tuition and travel. */
  priceIndexBp: number;
  /** Wage index; lags the price index (FR-50). */
  wageIndexBp: number;
  /** Market regime id and how many more weeks it lasts (FR-55). */
  regime: string;
  regimeWeeksLeft: number;
  /** Each asset's return in the last market move, for the ticker. */
  lastReturnsBp: Record<string, number>;
  /** Job ids open for applications this week. */
  openings: string[];
  /** News stories running now (FR-72), oldest first. */
  news: ActiveNews[];
}

export interface ActiveNews {
  id: string;
  /** The round it broke in. */
  since: number;
  /** Weeks it still runs, counting the coming one. */
  weeksLeft: number;
}

/** A choice a pipeline step needs from a player before it can finish (engine-design §11). */
export interface Decision {
  id: string;
  player: PlayerId;
  /** The step that asked, and that resolves it. */
  stepId: string;
  /** What it is about, such as the weekend event's id, or null. */
  subject: string | null;
  /**
   * Option ids. Copy key: `event.<subject>.<option>` for weekend events, otherwise `decision.<stepId>.<option>`.
   */
  options: string[];
  /** What each option costs and does, shown before the player picks (FR-03). Worked out when the step paused. */
  plans: Record<string, ChoicePlan>;
}

/** A plan for a decision option: a `Plan` plus what it changes beyond stats and money. */
export interface ChoicePlan extends Plan {
  /** Added to next week's time budget, in minutes. */
  nextWeekMinutes: number;
  jobRating: number;
  layoffWarning: boolean;
  gigBanWeeks: number;
}

/** FR-11, FR-12. `scores` are each player's score in basis points (average goal progress, each capped at 100%). */
export interface GameResult {
  reason: 'win' | 'weekLimit';
  week: number;
  winner: PlayerId;
  scores: Record<PlayerId, number>;
}

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
  netWorth: number;
  /** Goal progress in basis points, each capped at 10 000. */
  progressBp: Record<GoalKey, number>;
  /** FR-12 score in basis points. */
  scoreBp: number;
  /** What the rival feed and run summary compare week to week (FR-82, ENG-21). */
  job: string | null;
  jobLevel: number;
  housing: string;
  credentials: number;
  items: number;
  questsDone: number;
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
