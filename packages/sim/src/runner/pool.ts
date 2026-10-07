/**
 * Plays many games across `worker_threads` (simulator §2, SIM-02). Games are independent and fully described by
 * their seed and matchup, so how they are split across workers never changes a result; records come back in job
 * order. The pool resolves once every game is in; the first worker failure stops every worker and rejects.
 */
import { Worker } from 'node:worker_threads';
import type { DecisionTrace, GameRecord, Matchup } from './record.ts';

/** One game to play. */
export interface GameJob {
  matchup: Matchup;
  seed: string;
  /** Keep a decision trace (simulator §4). Games with anomalies are traced either way. */
  trace?: boolean;
}

/** What a worker sends back per game. */
export interface GameResultMessage {
  record: GameRecord;
  trace: DecisionTrace[] | null;
}

/** Games per message: big enough to keep messaging cheap, small enough to balance the load. */
const BATCH = 4;

export function runPool(
  jobs: GameJob[],
  options: {
    workers: number;
    override?: string | null;
    /** Keep traces of sampled and anomalous games; false skips the extra traced replay of anomalous ones. */
    traces?: boolean;
    onRecord?: (done: number) => void;
    onTrace?: (record: GameRecord, trace: DecisionTrace[]) => void;
  },
): Promise<GameRecord[]> {
  return runWorkers<GameJob, GameResultMessage>(new URL('./worker.ts', import.meta.url), jobs, {
    workers: options.workers,
    workerData: { override: options.override ?? null, traces: options.traces ?? true },
    onResult(message, done) {
      if (message.trace) options.onTrace?.(message.record, message.trace);
      options.onRecord?.(done);
    },
  }).then((results) => results.map((r) => r.record));
}

/**
 * Runs `jobs` across worker threads running `url`. A worker gets batches of jobs, posts one result per job, then
 * `null` to ask for more; it gets `null` when there is nothing left. Results come back in job order.
 */
export function runWorkers<J, R>(
  url: URL,
  jobs: J[],
  options: { workers: number; workerData?: unknown; onResult?: (result: R, done: number) => void },
): Promise<R[]> {
  if (!Number.isInteger(options.workers) || options.workers < 1)
    throw new Error(`workers must be a positive integer, got ${options.workers}`);
  const count = Math.min(options.workers, Math.max(1, jobs.length));
  const results: R[] = new Array(jobs.length);
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
      else resolve(results);
    };
    const fail = (error: unknown) => settle(error);
    if (jobs.length === 0) return settle(null);
    for (let i = 0; i < count; i++) {
      const worker = new Worker(url, { workerData: options.workerData ?? null });
      workers.push(worker);
      let batch: number[] = [];
      let got = 0;
      const send = () => {
        batch = [];
        while (batch.length < BATCH && next < jobs.length) batch.push(next++);
        got = 0;
        worker.postMessage(batch.length ? batch.map((j) => jobs[j]) : null);
      };
      worker.on('message', (message: R | null) => {
        if (message === null) return send();
        const at = batch[got++];
        if (at === undefined) return fail(new Error('a worker sent more results than jobs'));
        results[at] = message;
        done += 1;
        options.onResult?.(message, done);
        if (done === jobs.length) settle(null);
      });
      worker.on('error', fail);
      worker.on('exit', (code) => {
        if (code !== 0) return fail(new Error(`a sim worker exited with code ${code}`));
        if (--running === 0) fail(new Error(`${jobs.length - done} jobs never finished`));
      });
      send();
    }
  });
}
