/** An optimize worker (SIM-09): plays the optimizer and its base persona on each seed. */
import { parentPort, workerData } from 'node:worker_threads';
import { defaultContent } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import type { OptimizerOptions } from '../bots/optimizer.ts';
import { loadOverride } from '../override.ts';
import { type OptimizeJob, optimizeGame } from './optimize.ts';

const { override, options } = workerData as { override: string | null; options: OptimizerOptions };
const content = override ? loadOverride(defaultContent, override) : defaultContent;
const engine = createEngine(content);
const port = parentPort;
if (!port) throw new Error('worker.ts runs as a worker thread');

port.on('message', (jobs: OptimizeJob[] | null) => {
  if (jobs === null) {
    port.close();
    return;
  }
  for (const job of jobs) port.postMessage(optimizeGame(engine, content, job, options));
  port.postMessage(null);
});
