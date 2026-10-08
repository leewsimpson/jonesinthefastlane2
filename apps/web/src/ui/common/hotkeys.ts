/**
 * Keyboard shortcuts (NFR-03): every action gets one. Fixed keys for the main commands; the action rows on screen
 * take the remaining keys in order.
 */
import { useEffect, useRef } from 'react';

export const KEY_END_WEEK = 'e';
export const KEY_TRAVEL = 't';
export const KEY_DETAILS = 'd';

/** One-tap smart defaults (ENG-02) take Q, W and R; rows skip them. */
export const QUICK_KEYS = ['q', 'w', 'r'] as const;

/**
 * Plain keys first, then Shift with any letter: a fully stocked NeoBank lists more takeable rows than there are
 * plain keys left (NFR-03).
 */
export const ROW_KEYS = [
  ...'1234567890abcfghijklmnopsuvxyz'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((k) => `shift+${k}`),
];

/** The shortcut for the n-th row on screen, or undefined past the end of the list. */
export const rowKey = (n: number): string | undefined => ROW_KEYS[n];

/** How a shortcut is shown on its key cap: `shift+a` → `⇧A`. */
export const keyLabel = (key: string): string =>
  key.startsWith('shift+') ? `⇧${key.slice(6).toUpperCase()}` : key.toUpperCase();

/** The handler name for a key press: `shift+<letter>` with Shift held, else the lower-case key. */
export function keyName(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): string {
  const key = e.key.toLowerCase();
  return e.shiftKey && /^[a-z]$/.test(key) ? `shift+${key}` : key;
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * Calls `handlers[key]` on a plain key press (no Ctrl, Alt or Meta, not while typing in a field). Disable it while a
 * dialog with its own keys is open.
 */
export function useHotkeys(handlers: Record<string, () => void>, enabled = true): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // A dialog that handled the key marks it, so the same press can't also reach the screen behind it.
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.repeat || typing(e.target))
        return;
      const name = keyName(e);
      // Shift with a letter that has no shifted handler still works as the plain key.
      const fn = ref.current[name] ?? ref.current[e.key.toLowerCase()];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
