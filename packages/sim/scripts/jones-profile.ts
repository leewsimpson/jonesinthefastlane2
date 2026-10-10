/**
 * Jones's weekly goal profile against the scripted sensible human (Standard, 52 weeks): mean progress per goal per
 * week for both seats, how often Jones's Wellbeing sits at 100%, and final scores. A tuning aid for ai.json:
 * `node packages/sim/scripts/jones-profile.ts [games] [difficulty] [sensible|<persona id>]`.
 */
import { defaultContent } from '@fastlane/content';
import { personas } from '@fastlane/content/sim';
import { createEngine, type GameSetup, goalValues, progressBp, scoreBp } from '@fastlane/engine';
import { personaBot } from '../src/bots/policies.ts';
import { sensibleBot } from '../src/bots/sensible.ts';

const engine = createEngine(defaultContent);
const games = Number(process.argv[2] ?? 40);
const difficulty = (process.argv[3] ?? 'standard') as 'chill' | 'standard' | 'hustle-culture';
const botId = process.argv[4] ?? 'sensible';
const WEEKS = [2, 4, 6, 8, 12, 16, 20, 26, 32, 40];
const keys = ['wealth', 'wellbeing', 'skills', 'career'] as const;
const sum: Record<string, number[][]> = { p1: [], p2: [] };
const full = new Map<number, number>();
const seen = new Map<number, number>();
let jonesWins = 0;
let jonesScore = 0;
let humanScore = 0;
for (let g = 0; g < games; g++) {
  const setup: GameSetup = {
    seed: `prof-${g}`,
    players: [
      { name: 'Ada', controller: 'human' },
      { name: 'Jones', controller: 'ai' },
    ],
    config: { difficulty, weekLimit: 52 },
  };
  const { state } = engine.newGame(setup);
  const persona = personas.find((p) => p.id === botId);
  const bot = persona ? personaBot(defaultContent, persona, setup.seed) : sensibleBot;
  let last = 0;
  const sample = () => {
    for (const p of state.players) {
      const pr = progressBp(goalValues(defaultContent, p), state.config.goals);
      const rows = sum[p.id] as number[][];
      rows[state.week] ??= [0, 0, 0, 0, 0, 0];
      const row = rows[state.week] as number[];
      keys.forEach((k, i) => {
        row[i] += pr[k];
      });
      row[4] += scoreBp(pr);
      row[5] += 1;
      if (p.id === 'p2') {
        seen.set(state.week, (seen.get(state.week) ?? 0) + 1);
        if (pr.wellbeing >= 10000) full.set(state.week, (full.get(state.week) ?? 0) + 1);
      }
    }
  };
  while (state.phase.kind !== 'gameOver') {
    if (state.week !== last) {
      last = state.week;
      sample();
    }
    const r = engine.reduceInPlace(state, bot.choose(engine, state));
    if (!r.ok) throw new Error(r.error.code);
  }
  const [h, j] = state.players.map((p) =>
    scoreBp(progressBp(goalValues(defaultContent, p), state.config.goals)),
  );
  humanScore += h;
  jonesScore += j;
  if (j > h) jonesWins++;
}
const pct = (n: number) => (n / 100).toFixed(0).padStart(4);
for (const id of ['p1', 'p2']) {
  console.log(
    `${id === 'p1' ? 'human(sensible)' : 'Jones'}   wk  wealth wellb skills career score${id === 'p2' ? '  wb@100%' : ''}`,
  );
  for (const w of WEEKS) {
    const row = sum[id][w];
    if (!row || row[5] === 0) continue;
    const n = row[5];
    console.log(
      `                 ${String(w).padStart(2)}  ${keys.map((_, i) => pct(row[i] / n)).join('   ')}  ${pct(row[4] / n)}${id === 'p2' ? `   ${(((full.get(w) ?? 0) / (seen.get(w) ?? 1)) * 100).toFixed(0)}%` : ''}`,
    );
  }
}
console.log(
  `final score  human ${pct(humanScore / games)}  Jones ${pct(jonesScore / games)}  Jones ahead in ${((jonesWins / games) * 100).toFixed(0)}% of ${games} games`,
);
