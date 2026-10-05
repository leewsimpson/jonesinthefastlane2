/**
 * Plays many games across `worker_threads` (simulator §2, SIM-02). Games are independent and fully described by
 * their seed and matchup, so how they are split across workers never changes a result; records come back in job
 * order.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameRecord, Matchup } from './record.ts';

export interface Job {
  matchup: Matchup;
  seed: string;
}

/** Games per message: big enough to keep messaging cheap, small enough to balance the load. */
const BATCH = 4;

export async function runPool(
  jobs: Job[],
  options: { workers?: number; override?: string | null; onRecord?: (done: number) => void } = {},
): Promise<GameRecord[]> {
  const count = Math.max(1, Math.min(options.workers ?? availableParallelism(), jobs.length));
  const records: GameRecord[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const work = () =>
    new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        workerData: { override: options.override ?? null },
      });
      let batch: number[] = [];
      let got = 0;
      const send = () => {
        batch = [];
        while (batch.length < BATCH && next < jobs.length) batch.push(next++);
        got = 0;
        worker.postMessage(batch.length ? batch.map((i) => jobs[i]) : null);
        if (!batch.length) resolve();
      };
      worker.on('message', (record: GameRecord | null) => {
        if (record === null) {
          send();
          return;
        }
        const at = batch[got++];
        if (at === undefined) throw new Error('more records than jobs');
        records[at] = record;
        options.onRecord?.(++done);
      });
      worker.on('error', reject);
      worker.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)),
      );
      send();
    });
  await Promise.all(Array.from({ length: count }, work));
  return records;
}
