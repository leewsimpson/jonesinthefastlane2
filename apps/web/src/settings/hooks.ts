/** React hooks over the settings and the OS preferences they default to. */
import { useEffect, useState } from 'react';
import { darkTheme, mediaMatches, reducedMotion, useSettings } from './settings.ts';

function useMedia(q: string): boolean {
  const [now, setNow] = useState(() => mediaMatches(q).now);
  useEffect(() => {
    const m = mediaMatches(q);
    setNow(m.now);
    return m.listen(() => setNow(mediaMatches(q).now));
  }, [q]);
  return now;
}

/** True when animation should be cut (reduced-motion setting or OS preference). */
export function useReducedMotion(): boolean {
  const motion = useSettings((s) => s.motion);
  return reducedMotion(motion, useMedia('(prefers-reduced-motion: reduce)'));
}

/** True when the dark theme is showing. */
export function useDarkTheme(): boolean {
  const theme = useSettings((s) => s.theme);
  return darkTheme(theme, useMedia('(prefers-color-scheme: dark)'));
}
