/**
 * Screen state (tech-stack §4: no router). Lives in the initial bundle; everything behind the title screen is
 * lazy-loaded. Screens: title → new game setup → game (which shows the run summary once the game is over).
 */
import { create } from 'zustand';

export type Screen = { name: 'title' } | { name: 'setup' } | { name: 'game'; slot: string };

interface AppState {
  screen: Screen;
  go(screen: Screen): void;
}

export const useApp = create<AppState>()((set) => ({
  screen: { name: 'title' },
  go: (screen) => set({ screen }),
}));
