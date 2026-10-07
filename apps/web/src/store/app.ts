/**
 * Screen state (tech-stack §4: no router). Lives in the initial bundle; everything behind the title screen is
 * lazy-loaded. Screens: title → new game setup → game (which shows the run summary once the game is over), plus the
 * debug replay route.
 */
import { create } from 'zustand';

export type Screen =
  | { name: 'title' }
  | { name: 'setup' }
  | { name: 'game'; slot: string }
  /** The debug replay route, `#/replay` (simulator §4). Reached by URL only. */
  | { name: 'replay' };

const initial = (): Screen =>
  typeof location !== 'undefined' && location.hash === '#/replay'
    ? { name: 'replay' }
    : { name: 'title' };

interface AppState {
  screen: Screen;
  go(screen: Screen): void;
}

export const useApp = create<AppState>()((set) => ({
  screen: initial(),
  go: (screen) => set({ screen }),
}));
