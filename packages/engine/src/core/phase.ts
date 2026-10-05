/**
 * The turn → end-of-turn → end-of-round state machine (engine-design §7) and the contexts each stage gets.
 *
 *   turn(p1) ─endWeek─► endOfTurn(p1, steps…) ─► turn(p2) ─► … ─► endOfRound(steps…) ─► roll over ─► turn(p1)
 */
import type { GameContent } from '@fastlane/content';
import { playerById, restBonusEnergy } from '../actions/plan.ts';
import type { AiPolicy } from '../ai/random.ts';
import type { Pipeline } from '../pipeline/types.ts';
import { stream, streamKey } from '../rng/streams.ts';
import { changeStat } from '../stats/stats.ts';
import type { DomainEvent, TurnEndReason } from '../types/events.ts';
import type { GameState, PlayerState } from '../types/state.ts';
import type { PlayerCtx, RoundCtx } from './context.ts';

/** One `reduce` call's working set. `state` is the copy being changed. */
export interface Run {
  content: GameContent;
  pipeline: Pipeline;
  ai: AiPolicy;
  state: GameState;
  events: DomainEvent[];
}

export function emitter(run: Run) {
  return { content: run.content, emit: (e: DomainEvent) => run.events.push(e) };
}

export function playerCtx(run: Run, player: PlayerState): PlayerCtx {
  const { state } = run;
  return {
    ...emitter(run),
    week: state.week,
    player,
    world: state.world,
    rng: (name) => stream(state, streamKey(name, player.id, state.week)),
    newId: (prefix) => `${prefix}-${state.nextId++}`,
  };
}

export function roundCtx(run: Run): RoundCtx {
  const { state } = run;
  return {
    ...emitter(run),
    state,
    rng: (name) => stream(state, streamKey(name, '', state.week)),
  };
}

export function startTurn(run: Run, player: PlayerState): void {
  run.state.phase = { kind: 'turn', player: player.id };
  run.events.push({ type: 'turnStarted', player: player.id, week: run.state.week });
}

/** Turn end (FR-04): leftover time becomes the rest bonus, then the player's end-of-week steps start. */
export function endTurn(run: Run, player: PlayerState, reason: TurnEndReason): void {
  const minutes = player.timeLeft;
  if (minutes > 0) {
    const energy = restBonusEnergy(run.content, minutes);
    run.events.push({ type: 'restBonus', player: player.id, minutes, energy });
    if (energy > 0) changeStat(emitter(run), player, 'energy', energy, { kind: 'restBonus' });
  }
  player.timeLeft = 0;
  run.events.push({ type: 'turnEnded', player: player.id, reason });
  run.state.phase = { kind: 'endOfTurn', player: player.id, step: 0 };
}

/** After a player's last end-of-week step: record the week and hand over to the next player, or end the round. */
export function finishTurn(run: Run, player: PlayerState): void {
  const { state } = run;
  state.history.push({ week: state.week, player: player.id, cash: player.stats.cash });
  const next = state.players[state.players.indexOf(player) + 1];
  if (next) startTurn(run, next);
  else state.phase = { kind: 'endOfRound', step: 0 };
}

/** R5, always last: next week, fresh time, everyone home, this week's RNG streams dropped. */
export function rollOver(run: Run): void {
  const { state, content } = run;
  run.events.push({ type: 'roundEnded', week: state.week });
  state.week += 1;
  state.rng = {};
  for (const p of state.players) {
    p.timeLeft = content.balance.weekMinutes;
    p.location = content.city.board.home;
  }
  const first = state.players[0];
  if (!first) throw new Error('a game has players');
  startTurn(run, first);
}

/** Resolve the pending decision with the step that asked, then continue the pipeline. */
export function resolveDecision(run: Run, optionId: string): void {
  const { state, pipeline } = run;
  const { phase, pending } = state;
  if (!pending || phase.kind !== 'endOfTurn') throw new Error('no decision to resolve');
  const step = pipeline.perPlayer[phase.step];
  if (!step?.resolve || step.id !== pending.stepId)
    throw new Error(`step ${step?.id} can't resolve decision ${pending.id}`);
  run.events.push({ type: 'decisionMade', decision: pending, optionId });
  state.pending = null;
  step.resolve(playerCtx(run, playerById(state, phase.player)), pending, optionId);
  phase.step += 1;
}
