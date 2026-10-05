/**
 * Headless simulator (tech-stack §6). Phase 1: plays random legal games and checks each replays to the same state
 * hash (the Phase 1 exit criterion). The AI-vs-AI balance runner arrives in Phase 3.
 *
 *   pnpm sim [--games 20] [--weeks 52] [--players 2] [--seed fastlane]
 */
import { parseArgs } from 'node:util';
import { defaultContent } from '@fastlane/content';
import { ENGINE_VERSION } from '@fastlane/engine';
import { randomPlay } from './random-play.ts';

const { values } = parseArgs({
  // pnpm forwards a literal `--` before script arguments.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    games: { type: 'string', default: '20' },
    weeks: { type: 'string', default: '52' },
    players: { type: 'string', default: '2' },
    seed: { type: 'string', default: 'fastlane' },
  },
});
const games = Number(values.games);
const weeks = Number(values.weeks);
const players = Number(values.players);

console.log(
  `fastlane-sim — engine ${ENGINE_VERSION}, content v${defaultContent.meta.contentVersion}: ` +
    `${games} games × ${weeks} weeks × ${players} players of random legal actions`,
);

let mismatches = 0;
let totalActions = 0;
for (let g = 0; g < games; g++) {
  const setup = {
    seed: `${values.seed}-${g}`,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i + 1}`,
      kind: i === 0 ? ('human' as const) : ('ai' as const),
    })),
  };
  const result = randomPlay(defaultContent, setup, weeks, g);
  totalActions += result.actions.length;
  const ok = result.hash === result.replayHash;
  if (!ok) mismatches++;
  const cash = result.state.players.map((p) => p.stats.cash).join('/');
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${setup.seed}: week ${result.state.week}, ` +
      `${result.actions.length} actions, cash ${cash}, hash ${result.hash}`,
  );
}

console.log(`${totalActions} actions, ${mismatches} replay mismatches`);
process.exit(mismatches === 0 ? 0 : 1);
