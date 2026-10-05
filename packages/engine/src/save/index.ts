/**
 * Save format and migrations (engine-design §14). A separate entry point (`@fastlane/engine/save`), so the client can
 * lazy-load it, and Zod with it once the save schema arrives with IndexedDB persistence in Phase 4.
 */
import { hashValue } from '../core/hash.ts';
import { type Engine, ReplayError } from '../core/reduce.ts';
import type { Action } from '../types/actions.ts';
import type { GameSetup, GameState } from '../types/state.ts';
import { ENGINE_VERSION } from '../version.ts';

/** Bump when the save shape changes, and add a migration from the previous version. */
export const SAVE_VERSION = 3;

export interface SaveFile {
  format: 'fastlane-save';
  saveVersion: number;
  engineVersion: string;
  contentHash: string;
  setup: GameSetup;
  /** Human actions only, in order. AI moves are recomputed on replay. */
  log: Action[];
  /** State after the last action. Loading continues from here; replaying is for tests, bug reports and Daily Runs. */
  snapshot: GameState;
  snapshotHash: string;
}

/** Upgrades a save from version `n` to `n + 1`. Keyed by `n`. */
export type SaveMigration = (save: Record<string, unknown>) => Record<string, unknown>;
export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

/**
 * One entry per past save version. Versions 1 and 2 (Phase 1 and 2 state) have no migration: no saves existed
 * outside tests before Phase 4's persistence, so `loadSave` refuses them rather than guessing at the newer player
 * and world state.
 */
export const SAVE_MIGRATIONS: SaveMigrations = {};

export function createSave(
  engine: Engine,
  setup: GameSetup,
  log: readonly Action[],
  snapshot: GameState,
): SaveFile {
  return {
    format: 'fastlane-save',
    saveVersion: SAVE_VERSION,
    engineVersion: ENGINE_VERSION,
    contentHash: engine.contentHash,
    setup,
    log: [...log],
    snapshot,
    snapshotHash: hashValue(snapshot),
  };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Parse a stored save and run any migrations needed to bring it up to `SAVE_VERSION`. */
export function loadSave(json: string, migrations: SaveMigrations = SAVE_MIGRATIONS): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('save is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new SaveError('save is not an object');
  let save = raw as Record<string, unknown>;
  if (save.format !== 'fastlane-save') throw new SaveError('not a Fast Lane save');
  let version = save.saveVersion;
  if (typeof version !== 'number' || !Number.isInteger(version))
    throw new SaveError('save has no version');
  if (version > SAVE_VERSION)
    throw new SaveError(`save version ${version} is newer than this build`);
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new SaveError(`no migration from save version ${version}`);
    save = migrate(save);
    version += 1;
    save.saveVersion = version;
  }
  return save as unknown as SaveFile;
}

export type VerifyResult =
  | { ok: true }
  /** Different engine or content: the log can't be replayed under these rules. Only the snapshot is usable. */
  | { ok: false; reason: 'incompatible' }
  /** The log has an illegal action, or replays to a different state than the snapshot. */
  | { ok: false; reason: 'illegal' | 'diverged' };

/** Replay the log and check it reproduces the snapshot. Used for bug reports and Daily Run verification. */
export function verifySave(engine: Engine, save: SaveFile): VerifyResult {
  if (save.engineVersion !== ENGINE_VERSION || save.contentHash !== engine.contentHash)
    return { ok: false, reason: 'incompatible' };
  let replayed: GameState;
  try {
    replayed = engine.replay(save.setup, save.log);
  } catch (e) {
    if (e instanceof ReplayError) return { ok: false, reason: 'illegal' };
    throw e;
  }
  const hash = hashValue(replayed);
  return hash === save.snapshotHash && hash === hashValue(save.snapshot)
    ? { ok: true }
    : { ok: false, reason: 'diverged' };
}
