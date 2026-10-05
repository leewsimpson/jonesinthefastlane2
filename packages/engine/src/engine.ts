import type { GameContent } from '@fastlane/content';
import { STAT_KEYS } from '@fastlane/content/keys';
import { clone } from './clone.ts';
import { hashValue } from './hash.ts';
import { defaultPipeline, type Pipeline, type RoundStepContext } from './pipeline.ts';
import { currentPlayer, outputModifiers, previewAction, scaleGain } from './preview.ts';
import { nextInt, type RngState, type StreamName, streamSeed } from './rng.ts';
import { applyDeltas } from './stats.ts';
import type {
  ActionPreview,
  GameAction,
  GameEvent,
  GameSetup,
  GameState,
  PlayerState,
  ReduceResult,
  StatChanges,
  TurnEndReason,
} from './types.ts';

export const MAX_PLAYERS = 6;

export class IllegalActionError extends Error {
  readonly action: GameAction;
  readonly preview: ActionPreview;

  constructor(action: GameAction, preview: ActionPreview) {
    super(`illegal action ${JSON.stringify(action)}: ${preview.blockers.join(', ')}`);
    this.name = 'IllegalActionError';
    this.action = action;
    this.preview = preview;
  }
}

export interface Engine {
  readonly content: GameContent;
  newGame(setup: GameSetup): GameState;
  /** Apply one action for the current player. Pure: the input state is never changed. Throws on illegal actions. */
  reduce(state: GameState, action: GameAction): ReduceResult;
  previewAction(state: GameState, action: GameAction): ActionPreview;
  /** Every action the current player can take right now. Always includes `endWeek`. */
  legalActions(state: GameState): GameAction[];
  /** Rebuild a game from its setup and action log. */
  replay(setup: GameSetup, actions: readonly GameAction[]): GameState;
  hash(state: GameState): string;
}

export interface EngineOptions {
  pipeline?: Pipeline;
}

export function createEngine(content: GameContent, options: EngineOptions = {}): Engine {
  const pipeline = options.pipeline ?? defaultPipeline;
  const { balance, city } = content;

  function newGame(setup: GameSetup): GameState {
    if (setup.players.length < 1 || setup.players.length > MAX_PLAYERS)
      throw new Error(`a game needs 1–${MAX_PLAYERS} players`);
    return {
      seed: setup.seed,
      week: 1,
      turn: 0,
      rng: {},
      players: setup.players.map(
        (p, i): PlayerState => ({
          id: `p${i + 1}`,
          name: p.name,
          kind: p.kind,
          location: city.board.home,
          hoursLeft: balance.weekHours,
          stats: { ...balance.startingStats },
          fed: false,
          items: [],
        }),
      ),
    };
  }

  function reduce(state: GameState, action: GameAction): ReduceResult {
    const preview = previewAction(content, state, action);
    if (preview.blockers.length > 0) throw new IllegalActionError(action, preview);

    const draft = clone(state);
    const events: GameEvent[] = [];
    const ctx: RoundStepContext = {
      content,
      state: draft,
      rng: (name) => stream(draft, name),
      emit: (e) => events.push(e),
    };
    const player = currentPlayer(draft);

    switch (action.type) {
      case 'travel': {
        const from = player.location;
        player.location = action.to;
        player.hoursLeft -= preview.hours;
        const changes = applyDeltas(balance, player.stats, {
          cash: -preview.cost,
          energy: preview.effects.energy?.min ?? 0,
        });
        events.push({
          type: 'travelled',
          player: player.id,
          from,
          to: action.to,
          mode: action.mode,
          hours: preview.hours,
          changes,
        });
        break;
      }
      case 'perform': {
        const def = city.actions.find((a) => a.id === action.action);
        if (!def) throw new Error('unreachable: the preview checked the action exists');
        const modifiers = outputModifiers(content, player, def);
        const deltas: StatChanges = {};
        // Roll in STAT_KEYS order so the RNG sequence never depends on JSON key order.
        for (const key of STAT_KEYS) {
          const effect = def.effects[key];
          if (effect === undefined) continue;
          const raw =
            typeof effect === 'number'
              ? effect
              : nextInt(ctx.rng('actions'), effect.min, effect.max);
          deltas[key] = scaleGain(raw, modifiers);
        }
        deltas.cash = (deltas.cash ?? 0) - def.cost;
        player.hoursLeft -= def.hours;
        if (def.tags.includes('eat')) player.fed = true;
        const changes = applyDeltas(balance, player.stats, deltas);
        events.push({
          type: 'performed',
          player: player.id,
          action: def.id,
          hours: def.hours,
          changes,
        });
        break;
      }
      case 'endWeek':
        endTurn(ctx, 'endWeek');
        return { state: draft, events };
    }

    if (player.stats.energy <= 0) {
      // Forced rest (§4 Energy). The burnout event card arrives with the event deck in Phase 3.
      events.push({ type: 'burnout', player: player.id });
      endTurn(ctx, 'burnout');
    } else if (player.hoursLeft <= 0) {
      endTurn(ctx, 'outOfTime');
    }
    return { state: draft, events };
  }

  /** Finish the current player's week, run their end-of-week steps and pass the turn on (FR-04, FR-05). */
  function endTurn(ctx: RoundStepContext, reason: TurnEndReason) {
    const { state, emit } = ctx;
    const player = currentPlayer(state);
    if (player.hoursLeft > 0) {
      const changes = applyDeltas(balance, player.stats, {
        energy: player.hoursLeft * balance.restBonusEnergyPerHour,
      });
      emit({ type: 'restBonus', player: player.id, hours: player.hoursLeft, changes });
    }
    player.hoursLeft = 0;
    emit({ type: 'turnEnded', player: player.id, reason });
    for (const step of pipeline.perPlayer) step.run({ ...ctx, player });

    state.turn += 1;
    if (state.turn >= state.players.length) {
      for (const step of pipeline.perRound) step.run(ctx);
      emit({ type: 'roundEnded', week: state.week });
      state.week += 1;
      state.turn = 0;
      for (const p of state.players) {
        p.hoursLeft = balance.weekHours;
        p.location = city.board.home;
        p.fed = false;
      }
      emit({ type: 'weekStarted', week: state.week });
    }
    emit({ type: 'turnStarted', player: currentPlayer(state).id, week: state.week });
  }

  function legalActions(state: GameState): GameAction[] {
    const player = currentPlayer(state);
    const candidates: GameAction[] = [];
    for (const loc of city.board.locations) {
      for (const mode of city.board.transportModes) {
        candidates.push({ type: 'travel', to: loc.id, mode: mode.id });
      }
    }
    for (const a of city.actions) {
      if (a.location === player.location) candidates.push({ type: 'perform', action: a.id });
    }
    candidates.push({ type: 'endWeek' });
    return candidates.filter((a) => previewAction(content, state, a).blockers.length === 0);
  }

  function replay(setup: GameSetup, actions: readonly GameAction[]): GameState {
    let state = newGame(setup);
    for (const action of actions) state = reduce(state, action).state;
    return state;
  }

  return {
    content,
    newGame,
    reduce,
    previewAction: (state, action) => previewAction(content, state, action),
    legalActions,
    replay,
    hash: hashValue,
  };
}

/** The generator for a stream, created from the run seed on first use. */
function stream(state: GameState, name: StreamName): RngState {
  let s = state.rng[name];
  if (!s) {
    s = streamSeed(state.seed, name);
    state.rng[name] = s;
  }
  return s;
}
