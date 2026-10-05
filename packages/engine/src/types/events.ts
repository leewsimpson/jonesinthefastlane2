/**
 * Domain events (engine-design §12). The UI turns them into presentation (tech-stack §2). The engine never reads them
 * back and they aren't saved: a replay regenerates them.
 */
import type { DebtKind, StatKey } from '@fastlane/content/keys';
import type { Place } from '../money/ledger.ts';
import type { Decision, GameResult, PlayerId } from './state.ts';

/** Why a stat moved, so the UI can say so and the run summary can attribute it. */
export type Cause =
  | { kind: 'action'; id: string }
  | { kind: 'travel'; mode: string }
  | { kind: 'restBonus' }
  | { kind: 'step'; id: string };

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
] as const;
export const INTERNAL_FLOWS = ['save', 'withdraw', 'borrow', 'repay', 'lease-deposit'] as const;
export type FlowReason = (typeof EXTERNAL_FLOWS)[number] | (typeof INTERNAL_FLOWS)[number];

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
  | { type: 'roundEnded'; week: number }
  | { type: 'gameOver'; result: GameResult };
