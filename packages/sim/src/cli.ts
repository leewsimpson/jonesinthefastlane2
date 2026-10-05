/**
 * Headless simulator (simulator.md).
 *
 * Random play (Phase 1 exit check): random legal games, each replayed to the same state hash. Player 1 is a random
 * human; the rest are engine-played AI.
 *
 *   pnpm sim [--games 20] [--weeks 52] [--players 2] [--seed fastlane]
 *
 * Bots (simulator §3): each listed bot plays solo games and reports wins, weeks and score. Bots are persona ids from
 * `@fastlane/content/sim`, or `random`, `idle` or `sensible`. `--override` applies a content patch (simulator §7).
 *
 *   pnpm sim --bots balanced,careerist [--difficulty standard] [--override overrides/rent-plus-10.json]
 *
 * The full runner (worker pool, KPI bands, compare) arrives in Phase 3.
 */
import { parseArgs } from 'node:util';
import { DIFFICULTIES, type Difficulty, defaultContent, type GameContent } from '@fastlane/content';
import { personaById } from '@fastlane/content/sim';
import { createEngine, ENGINE_VERSION } from '@fastlane/engine';
import { idleBot, personaBot, randomBot } from './bots/policies.ts';
import { sensibleBot } from './bots/sensible.ts';
import { type Bot, playGame } from './game.ts';
import { loadOverride } from './override.ts';
import { randomPlay } from './random-play.ts';

const { values } = parseArgs({
  // pnpm forwards a literal `--` before script arguments.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    games: { type: 'string', default: '20' },
    weeks: { type: 'string', default: '52' },
    players: { type: 'string', default: '2' },
    seed: { type: 'string', default: 'fastlane' },
    bots: { type: 'string' },
    difficulty: { type: 'string', default: 'standard' },
    override: { type: 'string' },
  },
});
const games = Number(values.games);
const weeks = Number(values.weeks);
const content: GameContent = values.override
  ? loadOverride(defaultContent, values.override)
  : defaultContent;

console.log(
  `fastlane-sim — engine ${ENGINE_VERSION}, content v${content.meta.contentVersion}` +
    (values.override ? ` + ${values.override}` : ''),
);
process.exit(values.bots ? runBots(values.bots.split(',')) : runRandomPlay());

function runRandomPlay(): number {
  const players = Number(values.players);
  console.log(`${games} games × ${weeks} weeks × ${players} players of random legal actions`);
  let mismatches = 0;
  let totalActions = 0;
  for (let g = 0; g < games; g++) {
    const setup = {
      seed: `${values.seed}-${g}`,
      players: Array.from({ length: players }, (_, i) => ({
        name: `P${i + 1}`,
        controller: i === 0 ? ('human' as const) : ('ai' as const),
      })),
      config: { weekLimit: weeks },
    };
    const started = performance.now();
    const result = randomPlay(content, setup, `chooser-${g}`);
    const ms = performance.now() - started;
    totalActions += result.log.length;
    const ok = result.hash === result.replayHash;
    if (!ok) mismatches++;
    const cash = result.state.players.map((p) => p.stats.cash).join('/');
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${setup.seed}: week ${result.state.week}, ` +
        `${result.log.length} human actions, cash ${cash}, ${ms.toFixed(0)} ms (incl. replay), ` +
        `hash ${result.hash}`,
    );
  }
  console.log(`${totalActions} human actions, ${mismatches} replay mismatches`);
  return mismatches === 0 ? 0 : 1;
}

function botFor(id: string, seed: string): Bot {
  if (id === 'random') return randomBot(seed);
  if (id === 'idle') return idleBot;
  if (id === 'sensible') return sensibleBot;
  return personaBot(content, personaById(id), seed);
}

function runBots(ids: string[]): number {
  const difficulty = values.difficulty as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) throw new Error(`unknown difficulty ${difficulty}`);
  console.log(`${games} solo games × ${weeks} weeks per bot, ${difficulty}`);
  const engine = createEngine(content);
  console.log('bot        wins   median win week   mean score   ms/game');
  for (const id of ids) {
    const winWeeks: number[] = [];
    let scoreTotal = 0;
    const started = performance.now();
    for (let g = 0; g < games; g++) {
      const seed = `${values.seed}-${g}`;
      const setup = {
        seed,
        players: [{ name: id, controller: 'human' as const }],
        config: { weekLimit: weeks, difficulty },
      };
      const { state } = playGame(engine, setup, [botFor(id, seed)]);
      if (state.phase.kind !== 'gameOver') throw new Error('game did not end');
      const { result } = state.phase;
      if (result.reason === 'win') winWeeks.push(result.week);
      scoreTotal += result.scores.p1 ?? 0;
    }
    const ms = (performance.now() - started) / games;
    winWeeks.sort((a, b) => a - b);
    const median = winWeeks.length ? String(winWeeks[Math.floor(winWeeks.length / 2)]) : '—';
    console.log(
      `${id.padEnd(10)} ${`${winWeeks.length}/${games}`.padStart(5)}   ${median.padStart(15)}   ` +
        `${(scoreTotal / games / 100).toFixed(1).padStart(9)}%   ${ms.toFixed(0).padStart(7)}`,
    );
  }
  return 0;
}
