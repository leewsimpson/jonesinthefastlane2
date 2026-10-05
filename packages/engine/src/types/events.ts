/**
 * Domain events (engine-design §12). The UI turns them into presentation (tech-stack §2). The engine never reads them
 * back and they aren't saved: a replay regenerates them.
 */
import type { StatKey } from '@fastlane/content/keys';
import type { Decision, GameResult, PlayerId } from './state.ts';

/** Why a stat moved, so the UI can say so and the run summary can attribute it. */
export type Cause =
  | { kind: 'action'; id: string }
  | { kind: 'travel'; mode: string }
  | { kind: 'restBonus' }
  | { kind: 'step'; id: string };

export type TurnEndReason = 'endWeek' | 'outOfTime' | 'exhausted';

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
  | { type: 'actionPerformed'; player: PlayerId; actionId: string; minutes: number; money: number }
  | { type: 'statChanged'; player: PlayerId; stat: StatKey; from: number; to: number; cause: Cause }
  | { type: 'restBonus'; player: PlayerId; minutes: number; energy: number }
  | { type: 'mealSkipped'; player: PlayerId }
  | { type: 'turnEnded'; player: PlayerId; reason: TurnEndReason }
  | { type: 'decisionRequired'; decision: Decision }
  | { type: 'decisionMade'; decision: Decision; optionId: string }
  | { type: 'roundEnded'; week: number }
  | { type: 'gameOver'; result: GameResult };
