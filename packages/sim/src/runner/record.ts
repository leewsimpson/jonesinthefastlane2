/**
 * One game, played and summarised (simulator §4). Bots play the human seats; Jones, when the matchup has one, is an
 * AI seat the engine plays with its own persona (engine-design §7). The record is small and plain JSON, so thousands
 * of them fit in memory and cross the worker boundary.
 */
import type { Difficulty, GameContent } from '@fastlane/content';
import { personaById } from '@fastlane/content/sim';
import type { DomainEvent, Engine, GameSetup, PlayerSetup } from '@fastlane/engine';
import { giggerBot, idleBot, personaBot, randomBot } from '../bots/policies.ts';
import { sensibleBot } from '../bots/sensible.ts';
import type { Bot } from '../game.ts';

/** Who plays: one bot per human seat, then Jones at a difficulty, or no Jones. */
export interface Matchup {
  id: string;
  bots: string[];
  /** Jones's difficulty, or null for a game without Jones. */
  jones: Difficulty | null;
  difficulty: Difficulty;
  weekLimit: number;
}

/** Setbacks a seat suffered (simulator §5 Hardship). */
export interface Setbacks {
  evictions: number;
  collections: number;
  burnouts: number;
  layoffs: number;
}

export interface GameRecord {
  matchup: string;
  seed: string;
  /** Seat ids in order, and who plays each: a bot id or `jones`. */
  seats: string[];
  winner: string;
  /** The winning seat's player: a bot id or `jones`. */
  winnerBy: string;
  reason: 'win' | 'weekLimit';
  endWeek: number;
  scoresBp: number[];
  setbacks: Setbacks[];
  /** The week each seat was first paid wages or gig pay (ENG-20), or null. */
  firstPaycheck: (number | null)[];
  /** Ids drawn or used, for content reach (simulator §5). */
  events: string[];
  choices: string[];
  news: string[];
  jobs: string[];
  items: string[];
  quests: string[];
  /** Human actions taken, a proxy for decisions per game. */
  actions: number;
  ms: number;
}

export function botFor(content: GameContent, id: string, seed: string): Bot {
  if (id === 'random') return randomBot(seed);
  if (id === 'idle') return idleBot;
  if (id === 'sensible') return sensibleBot;
  if (id === 'gigger') return giggerBot(content);
  return personaBot(content, personaById(id), seed);
}

export function setupFor(matchup: Matchup, seed: string): GameSetup {
  const players: PlayerSetup[] = matchup.bots.map((bot, i) => ({
    name: `${bot}-${i + 1}`,
    controller: 'human',
  }));
  if (matchup.jones) players.push({ name: 'Jones', controller: 'ai' });
  return {
    seed,
    players,
    config: { weekLimit: matchup.weekLimit, difficulty: matchup.difficulty },
  };
}

/** A turn longer than this many bot actions is a bot bug. */
const MAX_ACTIONS_PER_TURN = 400;

export function playRecorded(engine: Engine, matchup: Matchup, seed: string): GameRecord {
  const started = performance.now();
  const setup = setupFor(matchup, seed);
  const seats = [...matchup.bots, ...(matchup.jones ? ['jones'] : [])];
  const bots = new Map(
    matchup.bots.map((id, i) => [`p${i + 1}`, botFor(engine.content, id, `${seed}|seat${i + 1}`)]),
  );
  const index = (player: string) => Number(player.slice(1)) - 1;
  const setbacks: Setbacks[] = seats.map(() => ({
    evictions: 0,
    collections: 0,
    burnouts: 0,
    layoffs: 0,
  }));
  const firstPaycheck: (number | null)[] = seats.map(() => null);
  const used = {
    events: new Set<string>(),
    choices: new Set<string>(),
    news: new Set<string>(),
    jobs: new Set<string>(),
    items: new Set<string>(),
    quests: new Set<string>(),
  };
  let week = 1;
  const observe = (events: DomainEvent[]) => {
    for (const e of events) {
      switch (e.type) {
        case 'turnStarted':
          week = e.week;
          break;
        case 'evicted':
          (setbacks[index(e.player)] as Setbacks).evictions++;
          break;
        case 'collections':
          (setbacks[index(e.player)] as Setbacks).collections++;
          break;
        case 'turnEnded':
          // A turn that ends at 0 Energy is a burnout (§4 Energy).
          if (e.reason === 'exhausted') (setbacks[index(e.player)] as Setbacks).burnouts++;
          break;
        case 'weekendEvent':
          used.events.add(e.event);
          break;
        case 'eventResolved':
          used.choices.add(`${e.event}.${e.choice}`);
          break;
        case 'newsStarted':
          used.news.add(e.news);
          break;
        case 'jobChanged':
          if (e.change === 'laidOff') (setbacks[index(e.player)] as Setbacks).layoffs++;
          used.jobs.add(e.job);
          break;
        case 'itemBought':
          used.items.add(e.item);
          break;
        case 'questCompleted':
          used.quests.add(e.quest);
          break;
        case 'moneyMoved':
          if (
            (e.reason === 'wage' || e.reason === 'gig') &&
            firstPaycheck[index(e.player)] === null
          )
            firstPaycheck[index(e.player)] = week;
          break;
      }
    }
  };

  const start = engine.newGame(setup);
  const state = start.state;
  observe(start.events);
  let actions = 0;
  let thisTurn = 0;
  let lastTurn = '';
  while (state.phase.kind !== 'gameOver') {
    const seat = state.pending?.player ?? (state.phase.kind === 'turn' ? state.phase.player : '');
    const bot = bots.get(seat);
    if (!bot) throw new Error(`no bot for seat ${seat}`);
    const turn = `${state.week}:${seat}`;
    thisTurn = turn === lastTurn ? thisTurn + 1 : 0;
    lastTurn = turn;
    if (thisTurn > MAX_ACTIONS_PER_TURN)
      throw new Error(`${bot.id} is stuck in week ${state.week}`);
    const action = bot.choose(engine, state);
    const result = engine.reduceInPlace(state, action);
    if (!result.ok)
      throw new Error(
        `${bot.id} chose an illegal action ${JSON.stringify(action)}: ${result.error.code}`,
      );
    actions++;
    observe(result.events);
  }
  const { result } = state.phase;
  return {
    matchup: matchup.id,
    seed,
    seats,
    winner: result.winner,
    winnerBy: seats[index(result.winner)] ?? '?',
    reason: result.reason,
    endWeek: result.week,
    scoresBp: state.players.map((p) => result.scores[p.id] ?? 0),
    setbacks,
    firstPaycheck,
    events: [...used.events].sort(),
    choices: [...used.choices].sort(),
    news: [...used.news].sort(),
    jobs: [...used.jobs].sort(),
    items: [...used.items].sort(),
    quests: [...used.quests].sort(),
    actions,
    ms: Math.round(performance.now() - started),
  };
}
