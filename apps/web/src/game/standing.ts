/** Goal values, progress and score for the HUD and the summary (FR-13, ENG-14), straight from the engine's maths. */
import {
  type GameState,
  type GoalValues,
  goalValues,
  type PlayerState,
  progressBp,
  scoreBp,
} from '@fastlane/engine';
import { content } from './engine.ts';

export interface Standing {
  values: GoalValues;
  progress: GoalValues;
  score: number;
}

export function standingOf(state: GameState, player: Readonly<PlayerState>): Standing {
  const values = goalValues(content, player);
  const progress = progressBp(values, state.config.goals);
  return { values, progress, score: scoreBp(progress) };
}
