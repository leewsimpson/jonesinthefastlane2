/**
 * Plays many games across `worker_threads` (simulator §2, SIM-02). Games are independent and fully described by
 * their seed and matchup, so how they are split across workers never changes a result; records come back in job
 * order. The pool resolves once every game is in; the first worker failure stops every worker and rejects.
 */
import { Worker } from 'node:worker_threads';
import type { GameRecord, Matchup } from './record.ts';

/** One game to play. */
export interface GameJob {
  matchup: Matchup;
  seed: string;
}

/** Games per message: big enough to keep messaging cheap, small enough to balance the load. */
const BATCH = 4;

export function runPool(
  jobs: GameJob[],
  options: { workers: number; override?: string | null; onRecord?: (done: number) => void },
): Promise<GameRecord[]> {
  if (!Number.isInteger(options.workers) || options.workers < 1)
    throw new Error(`workers must be a positive integer, got ${options.workers}`);
  const count = Math.min(options.workers, Math.max(1, jobs.length));
  const records: GameRecord[] = new Array(jobs.length);
  const workers: Worker[] = [];
  let next = 0;
  let done = 0;

  return new Promise((resolve, reject) => {
    let running = count;
    let settled = false;
    const settle = (error: unknown | null) => {
      if (settled) return;
      settled = true;
      for (const w of workers) void w.terminate();
      if (error) reject(error);
      else resolve(records);
    };
    const fail = (error: unknown) => settle(error);
    if (jobs.length === 0) return settle(null);
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        workerData: { override: options.override ?? null },
      });
      workers.push(worker);
      let batch: number[] = [];
      let got = 0;
      const send = () => {
        batch = [];
        while (batch.length < BATCH && next < jobs.length) batch.push(next++);
        got = 0;
        worker.postMessage(batch.length ? batch.map((j) => jobs[j]) : null);
      };
      worker.on('message', (record: GameRecord | null) => {
        if (record === null) return send();
        const at = batch[got++];
        if (at === undefined) return fail(new Error('a worker sent more records than games'));
        records[at] = record;
        done += 1;
        options.onRecord?.(done);
        if (done === jobs.length) settle(null);
      });
      worker.on('error', fail);
      worker.on('exit', (code) => {
        if (code !== 0) return fail(new Error(`a sim worker exited with code ${code}`));
        if (--running === 0) fail(new Error(`${jobs.length - done} games never finished`));
      });
      send();
    }
  });
}
