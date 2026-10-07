/** A pool worker (simulator §2): one engine and content instance, playing the games it's sent. */
import { parentPort, workerData } from 'node:worker_threads';
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { loadOverride } from '../override.ts';
import type { GameJob, GameResultMessage } from './pool.ts';
import { playRecorded, playTraced } from './record.ts';

const { override, traces } = workerData as { override: string | null; traces: boolean };
const engine = createEngine(override ? loadOverride(defaultContent, override) : defaultContent);
const port = parentPort;
if (!port) throw new Error('worker.ts runs as a worker thread');

port.on('message', (jobs: GameJob[] | null) => {
  if (jobs === null) {
    port.close();
    return;
  }
  for (const job of jobs) port.postMessage(playJob(job));
  port.postMessage(null);
});

/** Play a job; trace it if asked, or replay it traced if it turned out anomalous (simulator §4). */
function playJob(job: GameJob): GameResultMessage {
  if (job.trace) return playTraced(engine, job.matchup, job.seed);
  const record = playRecorded(engine, job.matchup, job.seed);
  if (!traces || record.anomalies.length === 0) return { record, trace: null };
  return playTraced(engine, job.matchup, job.seed);
}
