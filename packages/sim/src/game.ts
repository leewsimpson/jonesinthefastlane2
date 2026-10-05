/** Play one game headless with a bot in each human seat (simulator §2). AI seats are played by the engine. */
import type { Action, Engine, GameSetup, GameState } from '@fastlane/engine';

/** A bot chooses the next action for the active human seat it plays. */
export interface Bot {
  id: string;
  choose(engine: Engine, state: GameState): Action;
}

export interface GameRun {
  state: GameState;
  log: Action[];
}

/** A turn longer than this many bot actions is a bot bug. */
const MAX_ACTIONS_PER_TURN = 400;

/** Plays until the game ends. `bots[i]` plays the i-th human seat. Needs a week limit or a winnable game. */
export function playGame(engine: Engine, setup: GameSetup, bots: Bot[]): GameRun {
  const humans = setup.players.flatMap((p, i) => (p.controller === 'human' ? [`p${i + 1}`] : []));
  const botFor = new Map(humans.map((id, i) => [id, bots[i % bots.length]]));
  let { state } = engine.newGame(setup);
  const log: Action[] = [];
  let actionsThisTurn = 0;
  let lastTurn = '';
  while (state.phase.kind !== 'gameOver') {
    const seat = state.pending?.player ?? (state.phase.kind === 'turn' ? state.phase.player : '');
    const bot = botFor.get(seat);
    if (!bot) throw new Error(`no bot for seat ${seat}`);
    const turn = `${state.week}:${seat}`;
    actionsThisTurn = turn === lastTurn ? actionsThisTurn + 1 : 0;
    lastTurn = turn;
    if (actionsThisTurn > MAX_ACTIONS_PER_TURN)
      throw new Error(`${bot.id} is stuck in week ${state.week}`);
    const action = bot.choose(engine, state);
    const result = engine.reduceInPlace(state, action);
    if (!result.ok)
      throw new Error(
        `${bot.id} chose an illegal action ${JSON.stringify(action)}: ${result.error.code}`,
      );
    log.push(action);
    state = result.state;
  }
  return { state, log };
}
