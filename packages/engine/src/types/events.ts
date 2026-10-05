/**
 * Domain events (engine-design §12). The UI turns them into presentation (tech-stack §2). The engine never reads them
 * back and they aren't saved: a replay regenerates them.
 */
import type {
  DebtKind,
  EventCategory,
  FeedMoment,
  GoalKey,
  StatKey,
  TeaserId,
} from '@fastlane/content/keys';
import type { Place } from '../money/ledger.ts';
import type { Decision, GameResult, PlayerId } from './state.ts';

/** Why a stat moved, so the UI can say so and the run summary can attribute it. */
export type Cause =
  | { kind: 'action'; id: string }
  | { kind: 'travel'; mode: string }
  | { kind: 'restBonus' }
  | { kind: 'step'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'quest'; id: string };

export type TurnEndReason = 'endWeek' | 'outOfTime' | 'exhausted';

/**
 * Why money moved (engine-design §10.1). Money entering or leaving a player's books (`outside`) has an external
 * reason; money between their own places has an internal one.
 */
export const EXTERNAL_FLOWS = [
  'wage',
  'gig',
  'income',
  'interest',
  'market',
  'spend',
  'travel',
  'rent',
  'subscription',
  'tuition',
  'fee',
  'reward',
] as const;
export const INTERNAL_FLOWS = ['save', 'withdraw', 'borrow', 'repay', 'lease-deposit'] as const;
export type FlowReason = (typeof EXTERNAL_FLOWS)[number] | (typeof INTERNAL_FLOWS)[number];

/** Values for a copy line's `{{slot}}`s: ids of things with their own copy, cents for money, plain numbers. */
export type SlotParams = Record<string, string | number>;

export type JobChange =
  | 'hired'
  | 'promoted'
  | 'hoursCut'
  | 'restructured'
  | 'layoffWarning'
  | 'laidOff'
  | 'letGo';

export type DomainEvent =
  | { type: 'turnStarted'; player: PlayerId; week: number }
  | {
      type: 'travelled';
      player: PlayerId;
      from: string;
      to: string;
      mode: string;
      minutes: number;
      money: number;
    }
  | {
      type: 'actionPerformed';
      player: PlayerId;
      actionId: string;
      minutes: number;
      money: number;
      target?: string;
    }
  | { type: 'statChanged'; player: PlayerId; stat: StatKey; from: number; to: number; cause: Cause }
  | {
      type: 'moneyMoved';
      player: PlayerId;
      from: Place;
      to: Place;
      amount: number;
      reason: FlowReason;
      cause: Cause;
    }
  | { type: 'restBonus'; player: PlayerId; minutes: number; energy: number }
  | { type: 'mealSkipped'; player: PlayerId }
  | { type: 'turnEnded'; player: PlayerId; reason: TurnEndReason }
  | { type: 'decisionRequired'; decision: Decision }
  | { type: 'decisionMade'; decision: Decision; optionId: string }
  | { type: 'jobChanged'; player: PlayerId; change: JobChange; job: string }
  | { type: 'gigDeactivated'; player: PlayerId; weeks: number }
  | { type: 'enrolled'; player: PlayerId; course: string; loan: boolean }
  | { type: 'credentialEarned'; player: PlayerId; course: string }
  | { type: 'courseDropped'; player: PlayerId; course: string }
  | { type: 'itemBought'; player: PlayerId; item: string }
  | { type: 'subscribed'; player: PlayerId; subscription: string }
  | {
      type: 'unsubscribed';
      player: PlayerId;
      subscription: string;
      reason: 'cancelled' | 'unpaid';
    }
  /** FR-52: the total weekly drain of the player's subscriptions, in cents. */
  | { type: 'subscriptionAudit'; player: PlayerId; weekly: number; subscriptions: string[] }
  | { type: 'moved'; player: PlayerId; from: string; to: string; rent: number }
  | { type: 'leaseRenewed'; player: PlayerId; from: number; to: number }
  | { type: 'rentMissed'; player: PlayerId; owed: number; missed: number }
  | { type: 'evicted'; player: PlayerId; from: string }
  | { type: 'paymentMissed'; player: PlayerId; debt: DebtKind; due: number }
  | { type: 'collections'; player: PlayerId; debt: DebtKind }
  | {
      type: 'marketMoved';
      week: number;
      regime: string;
      returnsBp: Record<string, number>;
      priceIndexBp: number;
      wageIndexBp: number;
    }
  /** A weekend event card is drawn (FR-70). A card with choices then pauses for `decisionRequired`. */
  | { type: 'weekendEvent'; player: PlayerId; event: string; category: EventCategory }
  /** The card's effects were applied with this choice. */
  | { type: 'eventResolved'; player: PlayerId; event: string; choice: string }
  | { type: 'newsStarted'; news: string; weeks: number }
  | { type: 'newsEnded'; news: string }
  | { type: 'questIssued'; player: PlayerId; quest: string; deadline: number }
  | { type: 'questCompleted'; player: PlayerId; quest: string }
  | { type: 'questFailed'; player: PlayerId; quest: string }
  /**
   * A next-week hook (ENG-10). `params` fill the copy's slots (`teaser.<id>`): ids for things with their own copy
   * (a job id → `job.<id>`), cents for money, plain numbers otherwise.
   */
  | { type: 'teaser'; player: PlayerId; teaser: TeaserId; params: SlotParams }
  /**
   * Jones's highlight reel (FR-82): `player` is the AI who posts, `about` the human it reacts to, if any. Copy:
   * `feed.<moment>.<n>`; the UI picks the variant. `params` as for teasers.
   */
  | {
      type: 'rivalPost';
      player: PlayerId;
      moment: FeedMoment;
      about: PlayerId | null;
      params: SlotParams;
    }
  /** Every player's score and goal progress after the round (ENG-14: rival progress is always visible). */
  | {
      type: 'standings';
      week: number;
      scoresBp: Record<PlayerId, number>;
      progressBp: Record<PlayerId, Record<GoalKey, number>>;
    }
  /** `by` moved ahead of `player` on score this round (ENG-14). */
  | { type: 'overtaken'; player: PlayerId; by: PlayerId }
  /**
   * A goal just short of its target (ENG-13): `short` is what's missing, in the goal's units (cents for wealth).
   * `final` when the game has ended.
   */
  | {
      type: 'nearMiss';
      player: PlayerId;
      goal: GoalKey;
      short: number;
      progressBp: number;
      final: boolean;
    }
  | { type: 'roundEnded'; week: number }
  | { type: 'gameOver'; result: GameResult };
