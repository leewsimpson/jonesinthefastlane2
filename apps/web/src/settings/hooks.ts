/** React hooks over the settings and the OS preferences they default to. */
import { useEffect, useState } from 'react';
import { mediaMatches, reducedMotion, useSettings } from './settings.ts';

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

/** The desktop layout's query (NFR-02), shared with the `wide` CSS variant in index.css. */
export const WIDE_LAYOUT = '(min-width: 1024px) and (min-height: 600px)';

/** True on the desktop layout; false on the mobile one (index.css). */
export function useWideLayout(): boolean {
  return useMedia(WIDE_LAYOUT);
}
