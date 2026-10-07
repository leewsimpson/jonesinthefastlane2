/** An assess worker (simulator §6): plays games and assesses their sampled weekend decisions. */
import { parentPort, workerData } from 'node:worker_threads';
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { loadOverride } from '../override.ts';
import type { Matchup } from '../runner/record.ts';
import { type AssessOptions, assessGame } from './assess.ts';

export interface AssessJob {
  matchup: Matchup;
  seed: string;
}

const { override, options } = workerData as { override: string | null; options: AssessOptions };
const engine = createEngine(override ? loadOverride(defaultContent, override) : defaultContent);
const port = parentPort;
if (!port) throw new Error('worker.ts runs as a worker thread');

port.on('message', (jobs: AssessJob[] | null) => {
  if (jobs === null) {
    port.close();
    return;
  }
  for (const job of jobs) port.postMessage(assessGame(engine, job.matchup, job.seed, options));
  port.postMessage(null);
});
