/**
 * One game, played and summarised (simulator §4). Bots play the human seats; Jones, when the matchup has one, is an
 * AI seat the engine plays with its own persona (engine-design §7). The record is small and plain JSON, so thousands
 * of them fit in memory and cross the worker boundary.
 */
import type { Difficulty, GameContent } from '@fastlane/content';
import { personaById } from '@fastlane/content/sim';
import type {
  Action,
  DomainEvent,
  Engine,
  GameSetup,
  GameState,
  PlayerSetup,
} from '@fastlane/engine';
import { giggerBot, idleBot, personaBot, randomBot } from '../bots/policies.ts';
import { sensibleBot } from '../bots/sensible.ts';
import type { Bot, ScoredMove } from '../game.ts';
import { applyScenario, type Scenario } from '../scenario.ts';

/** Who plays: one bot per human seat, then Jones at a difficulty, or no Jones. */
export interface Matchup {
  id: string;
  bots: string[];
  /** Jones's difficulty, or null for a game without Jones. */
  jones: Difficulty | null;
  difficulty: Difficulty;
  weekLimit: number;
  /** A scenario start (simulator §7), or none for a normal new game. */
  start?: Scenario | null;
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
  /** The week each seat first had a goal at `MILESTONE_BP` (simulator §5 Early hook), or null. */
  firstMilestone: (number | null)[];
  /** Each seat's net worth at the end of each week, in whole dollars (simulator §4). */
  netWorthByWeek: number[][];
  /** Why this game looks wrong (simulator §4); anomalous games are always traced. */
  anomalies: string[];
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

/** A goal at a quarter of its target counts as the first milestone (simulator §5 Early hook). */
export const MILESTONE_BP = 2500;

/** Events worth keeping in a trace: what a reader needs to follow the game, not every stat tick. */
const TRACED_EVENTS = new Set<DomainEvent['type']>([
  'jobChanged',
  'enrolled',
  'credentialEarned',
  'itemBought',
  'subscribed',
  'unsubscribed',
  'moved',
  'evicted',
  'collections',
  'weekendEvent',
  'eventResolved',
  'newsStarted',
  'questCompleted',
  'questFailed',
  'gigDeactivated',
  'turnEnded',
  'mealSkipped',
]);

/** Options kept per decision in a trace, best first. */
const TRACE_OPTIONS = 8;

/** One human decision in a traced game (simulator §4, SIM-06). */
export interface DecisionTrace {
  week: number;
  player: string;
  bot: string;
  /** What the player could see when choosing. */
  view: {
    location: string;
    cash: number;
    energy: number;
    timeLeft: number;
    job: string | null;
  };
  /** The bot's top options with scores; empty for bots that can't explain themselves. */
  options: ScoredMove[];
  chosen: Action;
  events: DomainEvent[];
}

export interface TracedGame {
  record: GameRecord;
  trace: DecisionTrace[];
}

export function playRecorded(engine: Engine, matchup: Matchup, seed: string): GameRecord {
  return play(engine, matchup, seed, false).record;
}

/** Play a game and keep a decision trace. Same game as `playRecorded`: explaining a move never changes it. */
export function playTraced(engine: Engine, matchup: Matchup, seed: string): TracedGame {
  return play(engine, matchup, seed, true);
}

/** The first week each seat had a goal at `MILESTONE_BP`. */
function firstMilestones(state: GameState): (number | null)[] {
  return state.players.map((p) => {
    const hit = state.history.find(
      (r) => r.player === p.id && Object.values(r.progressBp).some((v) => v >= MILESTONE_BP),
    );
    return hit ? hit.week : null;
  });
}

/** Anomalies (simulator §4) for the human seats, from the finished game. */
export function anomaliesOf(
  state: GameState,
  seats: string[],
  setbacks: Setbacks[],
  scoresBp: number[],
  reason: GameRecord['reason'],
  chosen: Map<string, Map<string, number>>,
): string[] {
  const found: string[] = [];
  state.players.forEach((p, i) => {
    if (seats[i] === 'jones') return;
    if (reason === 'weekLimit' && (scoresBp[i] ?? 0) < 1000 && !FLOOR_BOTS.has(seats[i] ?? ''))
      found.push(`${p.id}: score under 10% at the week limit`);
    if ((setbacks[i]?.evictions ?? 0) >= 3) found.push(`${p.id}: eviction loop`);
    const counts = chosen.get(p.id);
    if (counts) {
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      for (const [kind, n] of counts)
        if (total >= 20 && n * 10 > total * 8 && kind !== 'endWeek')
          found.push(`${p.id}: ${kind} is ${Math.round((n * 100) / total)}% of actions`);
    }
    const cash = state.history.filter((r) => r.player === p.id).map((r) => r.cash);
    const swings = cash.slice(1).map((c, k) => Math.abs(c - (cash[k] ?? 0)));
    const sorted = [...swings].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const top = sorted.at(-1) ?? 0;
    if (mid > 0 && top > mid * 5 && top > 100_000)
      found.push(
        `${p.id}: weekly cash swing ${Math.round(top / 100)} vs median ${Math.round(mid / 100)}`,
      );
  });
  return found;
}

/** Stats outside their content ranges at the end of the game: an engine bug (simulator §4). */
function outOfRange(engine: Engine, state: GameState): string[] {
  const found: string[] = [];
  for (const p of state.players)
    for (const [stat, range] of Object.entries(engine.content.balance.statRanges)) {
      const v = p.stats[stat as keyof typeof p.stats];
      if (v < range.min || (range.max !== null && v > range.max))
        found.push(`${p.id}: ${stat} ${v} out of range`);
    }
  return found;
}

/** Floor bots play badly on purpose; a low score from them isn't an anomaly. */
const FLOOR_BOTS = new Set(['idle', 'random', 'gigger']);

/** What a `perform` or travel is, for counting repeats: the action id or the trip. */
const actionKind = (a: Action) =>
  a.type === 'perform' ? a.actionId : a.type === 'travel' ? 'travel' : a.type;

function play(engine: Engine, matchup: Matchup, seed: string, tracing: boolean): TracedGame {
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
  if (matchup.start) applyScenario(state, matchup.start);
  observe(start.events);
  let actions = 0;
  const trace: DecisionTrace[] = [];
  const chosen = new Map<string, Map<string, number>>();
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
    const before = tracing ? traceView(state, seat) : null;
    const options =
      tracing && bot.explain
        ? [...bot.explain(engine, state)].sort((a, b) => b.score - a.score).slice(0, TRACE_OPTIONS)
        : [];
    const action = bot.choose(engine, state);
    const result = engine.reduceInPlace(state, action);
    if (!result.ok)
      throw new Error(
        `${bot.id} chose an illegal action ${JSON.stringify(action)}: ${result.error.code}`,
      );
    actions++;
    if (action.type !== 'decide') {
      const counts = chosen.get(seat) ?? new Map<string, number>();
      counts.set(actionKind(action), (counts.get(actionKind(action)) ?? 0) + 1);
      chosen.set(seat, counts);
    }
    if (before)
      trace.push({
        week: before.week,
        player: seat,
        bot: bot.id,
        view: before.view,
        options,
        chosen: action,
        // The result also carries AI turns played after this action; keep this seat's events and world news.
        events: result.events.filter(
          (e) => TRACED_EVENTS.has(e.type) && (!('player' in e) || e.player === seat),
        ),
      });
    observe(result.events);
  }
  const { result } = state.phase;
  const scoresBp = state.players.map((p) => result.scores[p.id] ?? 0);
  const record: GameRecord = {
    matchup: matchup.id,
    seed,
    seats,
    winner: result.winner,
    winnerBy: seats[index(result.winner)] ?? '?',
    reason: result.reason,
    endWeek: result.week,
    scoresBp,
    setbacks,
    firstPaycheck,
    firstMilestone: firstMilestones(state),
    netWorthByWeek: state.players.map((p) =>
      state.history.filter((r) => r.player === p.id).map((r) => Math.round(r.netWorth / 100)),
    ),
    anomalies: [
      ...outOfRange(engine, state),
      ...anomaliesOf(state, seats, setbacks, scoresBp, result.reason, chosen),
    ],
    events: [...used.events].sort(),
    choices: [...used.choices].sort(),
    news: [...used.news].sort(),
    jobs: [...used.jobs].sort(),
    items: [...used.items].sort(),
    quests: [...used.quests].sort(),
    actions,
    ms: Math.round(performance.now() - started),
  };
  return { record, trace };
}

function traceView(state: GameState, seat: string) {
  const p = state.players.find((x) => x.id === seat);
  if (!p) throw new Error(`no seat ${seat}`);
  return {
    week: state.week,
    view: {
      location: p.location,
      cash: p.stats.cash,
      energy: p.stats.energy,
      timeLeft: p.timeLeft,
      job: p.job?.id ?? null,
    },
  };
}
