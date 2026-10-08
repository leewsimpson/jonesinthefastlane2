/**
 * Player settings (NFR-04): theme, motion and text size, plus whether week 1 coaches and data-sharing consent. They live in the initial
 * bundle and in `localStorage`: a per-browser convenience, so storage that is missing or throws (private windows)
 * only means the defaults are used. `applySettings` reflects them on `<html>`, where CSS picks them up.
 */
import { create } from 'zustand';

export type Theme = 'system' | 'light' | 'dark';
export type Motion = 'system' | 'reduce' | 'full';
export const TEXT_SIZES = [100, 115, 130] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface Settings {
  theme: Theme;
  motion: Motion;
  textSize: TextSize;
  /** Week 1 coach marks (ENG-20). */
  tutorial: boolean;
  /**
   * Consent to anonymous play telemetry (NFR-14, NFR-16). Off until the player opts in; any analytics loader must
   * check it before it loads, and stop when it is turned off.
   */
  shareData: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  motion: 'system',
  textSize: 100,
  tutorial: true,
  shareData: false,
};

const KEY = 'fastlane.settings';

/** Keeps only known values, so a hand-edited or old entry can't break the app. */
export function parseSettings(raw: string | null): Settings {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {
    // Unreadable: defaults.
  }
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    theme: pick(v.theme, ['system', 'light', 'dark'] as const, DEFAULT_SETTINGS.theme),
    motion: pick(v.motion, ['system', 'reduce', 'full'] as const, DEFAULT_SETTINGS.motion),
    textSize: pick(v.textSize, TEXT_SIZES, DEFAULT_SETTINGS.textSize),
    tutorial: typeof v.tutorial === 'boolean' ? v.tutorial : DEFAULT_SETTINGS.tutorial,
    shareData: v.shareData === true,
  };
}

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Puts the settings on `<html>`: `data-theme`, `data-motion` and the root font size every rem scales from. */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement): void {
  if (s.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  if (s.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = s.motion;
  root.style.fontSize = s.textSize === 100 ? '' : `${s.textSize}%`;
}

interface SettingsState extends Settings {
  set(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
    const { set: _set, ...next } = { ...get() };
    applySettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not remembered; it still applies until the page reloads.
    }
  },
}));

const query = (q: string) =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null;

/** Whether motion should be cut, from the setting or, by default, the OS (art-direction §4). */
export function reducedMotion(motion: Motion, osReduces: boolean): boolean {
  return motion === 'system' ? osReduces : motion === 'reduce';
}

/** Whether the board should use its dark look: the setting, or the OS when it's on "system". */
export function darkTheme(theme: Theme, osDark: boolean): boolean {
  return theme === 'system' ? osDark : theme === 'dark';
}

/** Live value of a media query, for hooks. */
export function mediaMatches(q: string): { now: boolean; listen(fn: () => void): () => void } {
  const mq = query(q);
  return {
    now: mq?.matches ?? false,
    listen(fn) {
      mq?.addEventListener('change', fn);
      return () => mq?.removeEventListener('change', fn);
    },
  };
}
