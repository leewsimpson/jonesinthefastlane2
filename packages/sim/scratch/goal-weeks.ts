// Scratch: week each goal first reaches 100% for a persona vs Jones, plus the final progress when it doesn't.
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { loadOverride } from '../src/override.ts';
import { botFor, setupFor } from '../src/runner/record.ts';
const [persona = 'balanced', difficulty = 'standard', games = '40', override] = process.argv.slice(2);
const content = override ? loadOverride(defaultContent, override) : defaultContent;
const engine = createEngine(content);
const goals = ['wealth', 'wellbeing', 'skills', 'career'] as const;
const weeks: Record<string, number[]> = { wealth: [], wellbeing: [], skills: [], career: [] };
const last: Record<string, number[]> = { wealth: [], wellbeing: [], skills: [], career: [] };
let wins = 0; const end: number[] = [];
for (let g = 0; g < Number(games); g++) {
  const m = { id: 'x', bots: [persona], jones: difficulty as 'standard', difficulty: difficulty as 'standard', weekLimit: 52 };
  const seed = `fastlane-${g}`;
  const bot = botFor(content, persona, `${seed}|seat1`);
  const { state } = engine.newGame(setupFor(m, seed));
  while (state.phase.kind !== 'gameOver') {
    const r = engine.reduceInPlace(state, bot.choose(engine, state));
    if (!r.ok) throw new Error(r.error.code);
  }
  if (state.phase.result.winner === 'p1') wins++;
  end.push(state.phase.result.week);
  const h = state.history.filter((r) => r.player === 'p1');
  for (const k of goals) {
    const hit = h.find((r) => r.progressBp[k] >= 10000);
    if (hit) weeks[k].push(hit.week);
    last[k].push(h.at(-1)?.progressBp[k] ?? 0);
  }
}
const med = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : '-';
console.log(`${persona} vs ${difficulty}: wins ${wins}/${games}, median end ${med(end)}`);
for (const k of goals) console.log(`${k.padEnd(10)} reached ${weeks[k].length}/${games}, median week ${med(weeks[k])}, median final ${med(last[k])}`);
