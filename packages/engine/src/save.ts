import type { Engine } from './engine.ts';
import type { GameAction, GameSetup, GameState } from './types.ts';

/** Bump when the save shape changes, and add a migration from the previous version (tech-stack §4). */
export const SAVE_VERSION = 1;

/**
 * A save holds the setup and full action log (so it can be replayed and verified) plus the latest state (so it loads
 * without replaying). The Zod schema for validating saves read from IndexedDB comes with persistence in Phase 4.
 */
export interface SaveFile {
  saveVersion: typeof SAVE_VERSION;
  contentVersion: number;
  setup: GameSetup;
  actions: GameAction[];
  state: GameState;
  stateHash: string;
}

/** Upgrades a save from version `n` to `n + 1`. Keyed by `n`. */
export type SaveMigration = (save: Record<string, unknown>) => Record<string, unknown>;
export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

/** One entry per past save version. Empty until the save shape first changes. */
export const SAVE_MIGRATIONS: SaveMigrations = {};

export function createSave(
  engine: Engine,
  setup: GameSetup,
  actions: readonly GameAction[],
  state: GameState,
): SaveFile {
  return {
    saveVersion: SAVE_VERSION,
    contentVersion: engine.content.meta.contentVersion,
    setup,
    actions: [...actions],
    state,
    stateHash: engine.hash(state),
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

/** Replay the action log and check it reproduces the saved state. Used for bug reports and run verification. */
export function verifySave(engine: Engine, save: SaveFile): boolean {
  const replayed = engine.replay(save.setup, save.actions);
  const hash = engine.hash(replayed);
  return hash === save.stateHash && hash === engine.hash(save.state);
}
