/**
 * Save slots in IndexedDB through Dexie (NFR-13, tech-stack §4). Each slot holds one `SaveFile`
 * (engine-design §14) as JSON plus a few fields for the slot list. Loading runs the save migrations, validates the
 * shape with Zod, and continues from the snapshot.
 */
import { createSave, loadSave, type SaveFile, serializeSave } from '@fastlane/engine/save';
import { Dexie, type EntityTable } from 'dexie';
import { engine } from '../game/engine.ts';
import type { Session } from '../store/game.ts';
import { SaveFileSchema } from './schema.ts';

export interface SlotRow {
  id: string;
  /** Epoch ms, for ordering the list. */
  updatedAt: number;
  week: number;
  players: string[];
  difficulty: string;
  finished: boolean;
  /** A serialised `SaveFile`. */
  save: string;
}

export type SlotSummary = Omit<SlotRow, 'save'>;

class SaveDb extends Dexie {
  slots!: EntityTable<SlotRow, 'id'>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ slots: '&id, updatedAt' });
  }
}

export interface SaveStore {
  write(session: Session): Promise<void>;
  list(): Promise<SlotSummary[]>;
  read(id: string): Promise<Session>;
  remove(id: string): Promise<void>;
}

export function openSaves(name = 'fastlane'): SaveStore {
  const db = new SaveDb(name);
  // Writes queue up in order, so a slow write can't land after a newer one.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    write(session) {
      const row = toRow(session);
      const done = queue.then(() => db.slots.put(row));
      queue = done.catch(() => {});
      return done.then(() => {});
    },
    async list() {
      const rows = await db.slots.orderBy('updatedAt').reverse().toArray();
      return rows.map(({ save: _save, ...summary }) => summary);
    },
    async read(id) {
      const row = await db.slots.get(id);
      if (!row) throw new Error(`no save ${id}`);
      return fromJson(id, row.save);
    },
    async remove(id) {
      await db.slots.delete(id);
    },
  };
}

function toRow(session: Session): SlotRow {
  const { state } = session;
  const save = createSave(engine, session.setup, session.log, state);
  return {
    id: session.id,
    updatedAt: Date.now(),
    week: state.week,
    players: state.players.map((p) => p.name),
    difficulty: state.config.difficulty,
    finished: state.phase.kind === 'gameOver',
    save: serializeSave(save),
  };
}

/** Parse, migrate and validate a save. Throws `SaveError` or a Zod error if it can't be used. */
export function fromJson(id: string, json: string): Session {
  const migrated = loadSave(json);
  const save = SaveFileSchema.parse(migrated) as unknown as SaveFile;
  return { id, setup: save.setup, log: save.log, state: save.snapshot };
}
