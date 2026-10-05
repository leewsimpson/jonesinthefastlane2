/** The engine: dispatch, validation and the advance loop (engine-design §3, §7). */
import type { GameContent } from '@fastlane/content';
import { DEBT_KINDS, DIFFICULTIES, GOAL_KEYS, SAVINGS_ID } from '@fastlane/content/keys';
import { HANDLERS } from '../actions/handlers.ts';
import { listActions, paramsOf, playerById, previewAction } from '../actions/plan.ts';
import { type AiPolicy, randomPolicy } from '../ai/random.ts';
import { transfer } from '../money/ledger.ts';
import { initialWorld } from '../pipeline/market.ts';
import { defaultPipeline } from '../pipeline/order.ts';
import type { Pipeline } from '../pipeline/types.ts';
import { createRng } from '../rng/rng.ts';
import { stream, streamKey } from '../rng/streams.ts';
import { changeStat } from '../stats/stats.ts';
import type { Action, Plan, Preview, ReduceResult } from '../types/actions.ts';
import type { DomainEvent } from '../types/events.ts';
import type { GameConfig, GameSetup, GameState, PlayerState } from '../types/state.ts';
import { STATE_SCHEMA_VERSION } from '../version.ts';
import { clone } from './clone.ts';
import { hashValue } from './hash.ts';
import {
  emitter,
  endTurn,
  finishTurn,
  playerCtx,
  type Run,
  resolveDecision,
  rollOver,
  roundCtx,
  startTurn,
} from './phase.ts';

/** FR-06. */
export const MAX_HUMANS = 4;
/**
 * A buggy AI policy throws instead of looping forever (engine-design §7). Every action takes at least 15 minutes, so
 * a legal week has at most `weekMinutes / 15` of them.
 */
const maxAiActions = (content: GameContent) => content.balance.weekMinutes / 15 + 1;

/** Defaults for everything but the goal targets, which come from the difficulty preset. */
export const DEFAULT_CONFIG = {
  weekLimit: null,
  turnLengthWeeks: 1,
  difficulty: 'standard',
} as const satisfies Partial<GameConfig>;

/**
 * Setup config → full config: `difficulty` picks preset targets; `goals` alone means custom targets (FR-10). Throws
 * on a setup no game can run with, such as a zero target, which would make progress divide by zero.
 */
export function resolveConfig(content: GameContent, setup: GameSetup): GameConfig {
  const given = setup.config ?? {};
  const difficulty = given.difficulty ?? (given.goals ? 'custom' : DEFAULT_CONFIG.difficulty);
  if (difficulty !== 'custom' && !DIFFICULTIES.includes(difficulty))
    throw new Error(`unknown difficulty ${difficulty}`);
  const goals = difficulty === 'custom' ? given.goals : content.balance.goals.presets[difficulty];
  if (!goals) throw new Error('custom difficulty needs goal targets');
  for (const key of GOAL_KEYS)
    if (!isPositiveInt(goals[key]))
      throw new Error(`goal target ${key} must be a positive integer`);
  const config: GameConfig = {
    weekLimit: given.weekLimit ?? DEFAULT_CONFIG.weekLimit,
    turnLengthWeeks: given.turnLengthWeeks ?? DEFAULT_CONFIG.turnLengthWeeks,
    difficulty,
    goals: { ...goals },
  };
  if (config.weekLimit !== null && !isPositiveInt(config.weekLimit))
    throw new Error('the week limit must be a positive integer or null');
  if (!isPositiveInt(config.turnLengthWeeks))
    throw new Error('turnLengthWeeks must be a positive integer');
  return config;
}

const isPositiveInt = (n: unknown): boolean => Number.isInteger(n) && (n as number) > 0;

export interface Engine {
  readonly content: GameContent;
  /** Pinned in saves: a log only replays under the content it was played with (engine-design §14). */
  readonly contentHash: string;
  /** Plays any AI turns before the first human's, so it returns their events too. */
  newGame(setup: GameSetup): { state: GameState; events: DomainEvent[] };
  /** Apply one action for the active player, then advance until a human must act. Never changes `state`. */
  reduce(state: GameState, action: Action): ReduceResult;
  /** `reduce` without the clone, for the simulator. Changes `state` on success; leaves it alone on a rule error. */
  reduceInPlace(state: GameState, action: Action): ReduceResult;
  /** Every option for the active player, available or not, with the reason (engine-design §8.2). */
  listActions(state: GameState): Preview[];
  /** What an action would do. Never changes state or RNG (FR-03). */
  preview(state: GameState, action: Action): Preview;
  /** Rebuild a game from its setup and human action log. Throws `ReplayError` if an action is illegal. */
  replay(setup: GameSetup, log: readonly Action[]): GameState;
  hash(state: GameState): string;
}

export interface EngineOptions {
  pipeline?: Pipeline;
  ai?: AiPolicy;
}

export class ReplayError extends Error {
  readonly index: number;

  constructor(index: number, code: string) {
    super(`log action ${index} is illegal: ${code}`);
    this.name = 'ReplayError';
    this.index = index;
  }
}

export function createEngine(content: GameContent, options: EngineOptions = {}): Engine {
  const pipeline = options.pipeline ?? defaultPipeline;
  const ai = options.ai ?? randomPolicy;
  const contentHash = hashValue(content);
  const newRun = (state: GameState): Run => ({ content, pipeline, ai, state, events: [] });

  function newGame(setup: GameSetup): { state: GameState; events: DomainEvent[] } {
    const config = resolveConfig(content, setup);
    const humans = setup.players.filter((p) => p.controller === 'human').length;
    if (humans > MAX_HUMANS) throw new Error(`a game has at most ${MAX_HUMANS} humans`);
    if (setup.players.length === 0) throw new Error('a game needs players');
    // Without a human nobody stops the advance loop, so an all-AI game needs an end.
    if (humans === 0 && config.weekLimit === null)
      throw new Error('an all-AI game needs a week limit');

    const { balance, city } = content;
    const [firstHome] = city.housing;
    if (!firstHome) throw new Error('no housing tiers');
    const holdings = [SAVINGS_ID, ...balance.market.assets.map((a) => a.id)];
    const players = setup.players.map(
      (p, i): PlayerState => ({
        id: `p${i + 1}`,
        name: p.name,
        controller: p.controller,
        location: city.board.home,
        timeLeft: balance.weekMinutes,
        stats: { ...balance.startingStats },
        mealsThisWeek: 0,
        items: [],
        pantryMeals: 0,
        job: null,
        experience: {},
        gigBanWeeks: 0,
        enrollment: null,
        credentials: [],
        trackMinutes: Object.fromEntries(balance.skills.tracks.map((t) => [t, 0])),
        housing: { tier: firstHome.id, rent: 0, leaseWeeksLeft: 0, deposit: 0, missedRent: 0 },
        holdings: Object.fromEntries(holdings.map((id) => [id, 0])),
        debts: Object.fromEntries(
          DEBT_KINDS.map((kind) => [kind, { balance: 0, missed: 0, collections: false }]),
        ) as PlayerState['debts'],
        subscriptions: [],
      }),
    );
    const state: GameState = {
      schemaVersion: STATE_SCHEMA_VERSION,
      seed: setup.seed,
      config,
      week: 1,
      phase: { kind: 'turn', player: 'p1' },
      players,
      world: initialWorld(content, createRng(`${setup.seed}|${streamKey('world', '', 0)}`)),
      rng: {},
      pending: null,
      nextId: 1,
      history: [],
    };
    const run = newRun(state);
    startTurn(run, players[0] as PlayerState);
    advance(run);
    return { state, events: run.events };
  }

  /** Validate against `state`, then change `copy(state)`. */
  function reduceWith(
    state: GameState,
    action: Action,
    copy: (s: GameState) => GameState,
  ): ReduceResult {
    const preview = previewAction(content, state, action);
    if (!preview.available) return { ok: false, error: preview.reason };
    const run = newRun(copy(state));
    applyAction(run, action, preview.plan);
    advance(run);
    return { ok: true, state: run.state, events: run.events };
  }

  const reduceInPlace = (state: GameState, action: Action) => reduceWith(state, action, (s) => s);

  /** Carry out an action that `previewAction` has already allowed. */
  function applyAction(run: Run, action: Action, plan: Plan): void {
    const { state } = run;
    if (action.type === 'decide') {
      resolveDecision(run, action.optionId);
      return;
    }
    if (state.phase.kind !== 'turn') throw new Error('unreachable: the preview checked the phase');
    const player = playerById(state, state.phase.player);
    switch (action.type) {
      case 'endWeek':
        endTurn(run, player, 'endWeek');
        return;
      case 'travel': {
        const from = player.location;
        player.location = action.to;
        player.timeLeft -= plan.time;
        run.events.push({
          type: 'travelled',
          player: player.id,
          from,
          to: action.to,
          mode: action.mode,
          minutes: plan.time,
          money: plan.money,
        });
        const ctx = emitter(run);
        const cause = { kind: 'travel', mode: action.mode } as const;
        transfer(ctx, player, 'cash', 'outside', plan.money, 'travel', cause);
        for (const e of plan.effects) changeStat(ctx, player, e.stat, e.delta, cause);
        break;
      }
      case 'perform': {
        const def = content.city.actions.find((a) => a.id === action.actionId);
        if (!def) throw new Error('unreachable: the preview checked the action exists');
        const params = paramsOf(action);
        run.events.push({
          type: 'actionPerformed',
          player: player.id,
          actionId: def.id,
          minutes: plan.time,
          money: plan.money,
          ...(params.target === undefined ? {} : { target: params.target }),
        });
        HANDLERS[def.kind].apply(playerCtx(run, player), def, plan, params);
        break;
      }
    }
    // Forced rest at 0 Energy (§4 Energy; the burnout event card arrives in Phase 3), or out of time (FR-04).
    if (player.stats.energy <= 0) endTurn(run, player, 'exhausted');
    else if (player.timeLeft <= 0) endTurn(run, player, 'outOfTime');
  }

  /** Run pipeline steps and AI turns until a human has to act or the game is over. */
  function advance(run: Run): void {
    const { state } = run;
    let aiActions = 0;
    for (;;) {
      const { phase } = state;
      switch (phase.kind) {
        case 'gameOver':
          return;
        case 'turn': {
          const player = playerById(state, phase.player);
          if (player.controller === 'human') return;
          if (++aiActions > maxAiActions(content))
            throw new Error(`AI ${player.id} took more than ${maxAiActions(content)} actions`);
          const options = listActions(content, state).filter((o) => o.available);
          const action = ai.chooseAction(options, aiRng(state, player), state);
          const preview = previewAction(content, state, action);
          if (!preview.available)
            throw new Error(`AI chose an unavailable action: ${preview.reason.code}`);
          applyAction(run, action, preview.plan);
          break;
        }
        case 'endOfTurn': {
          aiActions = 0;
          const player = playerById(state, phase.player);
          if (state.pending) {
            if (player.controller === 'human') return;
            resolveDecision(run, ai.chooseOption(state.pending, aiRng(state, player), state));
            break;
          }
          const step = pipeline.perPlayer[phase.step];
          if (!step) {
            finishTurn(run, player);
            break;
          }
          const result = step.run(playerCtx(run, player));
          if ('pause' in result) {
            state.pending = result.pause;
            run.events.push({ type: 'decisionRequired', decision: result.pause });
          } else phase.step += 1;
          break;
        }
        case 'endOfRound': {
          const step = pipeline.perRound[phase.step];
          if (!step) {
            rollOver(run);
            break;
          }
          const result = step.run(roundCtx(run));
          if ('pause' in result) throw new Error(`round step ${step.id} can't pause`);
          if (state.phase === phase) phase.step += 1;
          break;
        }
      }
    }
  }

  function replay(setup: GameSetup, log: readonly Action[]): GameState {
    const { state } = newGame(setup);
    log.forEach((action, i) => {
      const result = reduceInPlace(state, action);
      if (!result.ok) throw new ReplayError(i, result.error.code);
    });
    return state;
  }

  return {
    content,
    contentHash,
    newGame,
    reduce: (state, action) => reduceWith(state, action, clone),
    reduceInPlace,
    listActions: (state) => listActions(content, state),
    preview: (state, action) => previewAction(content, state, action),
    replay,
    hash: hashValue,
  };
}

function aiRng(state: GameState, player: PlayerState) {
  return stream(state, streamKey('ai', player.id, state.week));
}
