/** A pool worker (simulator §2): one engine and content instance, playing the games it's sent. */
import { parentPort, workerData } from 'node:worker_threads';
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { loadOverride } from '../override.ts';
import type { GameJob } from './pool.ts';
import { playRecorded } from './record.ts';

const { override } = workerData as { override: string | null };
const engine = createEngine(override ? loadOverride(defaultContent, override) : defaultContent);
const port = parentPort;
if (!port) throw new Error('worker.ts runs as a worker thread');

port.on('message', (jobs: GameJob[] | null) => {
  if (jobs === null) {
    port.close();
    return;
  }
  for (const job of jobs) port.postMessage(playRecorded(engine, job.matchup, job.seed));
  port.postMessage(null);
});
