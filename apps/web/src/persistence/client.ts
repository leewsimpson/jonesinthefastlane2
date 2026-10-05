/** The app's save store. Importing it loads the game chunk (engine, content, Dexie). */
import { openSaves } from './saves.ts';

export const saves = openSaves();
