/**
 * The `optimizer` (simulator §3, SIM-09): an exploit search. At each turn's first move and at every weekend choice it
 * takes the base persona's top candidates, plays short rollouts of each from a cloned state with common random
 * numbers (as `sim assess` does), and picks the best mean. Every other move is the base persona's. When a pick
 * beats the base persona's own by more than `EXPLOIT_GAIN_BP`, it is logged as a lead: a move the scorer
 * undervalues, or a hole in the economy.
 */
import type { GameContent } from '@fastlane/content';
import type { Action, Engine, GameState } from '@fastlane/engine';
import { playUntil, rolloutValue } from '../assess/assess.ts';
import type { Bot } from '../game.ts';
import { botFor } from '../runner/record.ts';

export interface OptimizerOptions {
  /** Base persona: plays the moves between lookaheads and every rollout. */
  base: string;
  /** How many of the base persona's top-scored moves to try. */
  candidates: number;
  rollouts: number;
  /** Weeks each rollout plays before its value is taken. */
  horizonWeeks: number;
}

export const DEFAULT_OPTIMIZER: OptimizerOptions = {
  base: 'balanced',
  candidates: 4,
  rollouts: 3,
  horizonWeeks: 4,
};

/** A lead is a pick worth this much more than the base persona's, in score basis points over the horizon. */
export const EXPLOIT_GAIN_BP = 300;

export interface Lead {
  seed: string;
  week: number;
  /** The move the optimizer found, and the one the base persona would have made. */
  found: string;
  instead: string;
  gainBp: number;
}

export interface OptimizerBot extends Bot {
  leads: Lead[];
}

/** A short, stable label for a move, for reports. */
export function moveLabel(move: Action | string): string {
  if (typeof move === 'string') return move;
  switch (move.type) {
    case 'travel':
      return `travel ${move.to} (${move.mode})`;
    case 'perform': {
      const params = [
        move.target,
        move.minutes && `${move.minutes}m`,
        move.amount && `$${move.amount / 100}`,
      ];
      return ['perform', move.actionId, ...params.filter(Boolean)].join(' ');
    }
    case 'decide':
      return `decide ${move.optionId}`;
    default:
      return move.type;
  }
}

const seatOf = (state: GameState) =>
  state.pending?.player ?? (state.phase.kind === 'turn' ? state.phase.player : '');

export function optimizerBot(
  content: GameContent,
  seed: string,
  options: OptimizerOptions = DEFAULT_OPTIMIZER,
): OptimizerBot {
  const base = botFor(content, options.base, seed);
  if (!base.explain) throw new Error(`${options.base} can't explain its moves`);
  const explain = base.explain;
  const leads: Lead[] = [];
  let lastTurn = '';

  return {
    id: 'optimizer',
    leads,
    choose(engine: Engine, state: GameState): Action {
      const seat = seatOf(state);
      const turn = `${state.week}:${seat}`;
      const firstMove = turn !== lastTurn;
      lastTurn = turn;
      const own = base.choose(engine, state);
      if (!state.pending && !firstMove) return own;

      const decision = state.pending;
      const toAction = (move: Action | string): Action =>
        typeof move === 'string'
          ? { type: 'decide', decisionId: decision?.id ?? '', optionId: move }
          : move;
      const ranked = explain(engine, state)
        .sort((a, b) => b.score - a.score)
        .slice(0, decision ? undefined : options.candidates)
        .map((m) => toAction(m.move));
      const ownLabel = moveLabel(own);
      if (!ranked.some((a) => moveLabel(a) === ownLabel)) ranked.push(own);
      if (ranked.length < 2) return own;

      const stopWeek = state.week + options.horizonWeeks;
      const value = (action: Action) => {
        let total = 0;
        for (let r = 0; r < options.rollouts; r++) {
          const copy = structuredClone(state);
          const forced = engine.reduceInPlace(copy, action);
          if (!forced.ok) return Number.NEGATIVE_INFINITY;
          const bots = new Map(
            copy.players
              .filter((p) => p.controller === 'human')
              .map((p) => [p.id, botFor(content, options.base, `${seed}|opt${r}|w${state.week}`)]),
          );
          playUntil(engine, copy, bots, stopWeek);
          total += rolloutValue(engine, copy, seat, stopWeek);
        }
        return total / options.rollouts;
      };
      const scored = ranked.map((action) => ({ action, value: value(action) }));
      const best = scored.reduce((a, b) => (b.value > a.value ? b : a));
      const ownValue = scored.find((s) => moveLabel(s.action) === ownLabel)?.value ?? best.value;
      if (best.value - ownValue >= EXPLOIT_GAIN_BP)
        leads.push({
          seed,
          week: state.week,
          found: moveLabel(best.action),
          instead: ownLabel,
          gainBp: Math.round(best.value - ownValue),
        });
      return best.action;
    },
  };
}
