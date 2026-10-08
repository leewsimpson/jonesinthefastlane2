/**
 * Captures a save from the current build as a fixture for the save-migration test (tech-stack §4, implementation-plan
 * Phase 6). Plays the sensible bot against Standard Jones until the given week, stopping on a pending weekend choice
 * so the save carries one, and prints the serialised `SaveFile`.
 *
 *   node packages/sim/scripts/capture-save.ts [week] > apps/web/src/persistence/__fixtures__/save-v<n>.json
 */
import { defaultContent } from '@fastlane/content';
import { type Action, createEngine } from '@fastlane/engine';
import { createSave, serializeSave } from '@fastlane/engine/save';
import { sensibleBot } from '../src/bots/sensible.ts';

const stopWeek = Number(process.argv[2] ?? 6);
const engine = createEngine(defaultContent);
const setup = {
  seed: 'beta-save',
  players: [
    { name: 'Ada', controller: 'human' as const },
    { name: 'Jones', controller: 'ai' as const },
  ],
  config: { difficulty: 'standard' as const },
};
let { state } = engine.newGame(setup);
const log: Action[] = [];
while (state.phase.kind !== 'gameOver' && !(state.week >= stopWeek && state.pending)) {
  const action = sensibleBot.choose(engine, state);
  const result = engine.reduceInPlace(state, action);
  if (!result.ok) throw new Error(result.error.code);
  log.push(action);
  state = result.state;
}
process.stdout.write(serializeSave(createSave(engine, setup, log, state)));
