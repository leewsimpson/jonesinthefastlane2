/** Motion for the game chunk: the lean `m` components with DOM animation features, following the motion setting. */
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { useSettings } from '../settings/settings.ts';

const REDUCED = { system: 'user', reduce: 'always', full: 'never' } as const;

export function MotionRoot({ children }: { children: ReactNode }) {
  const motion = useSettings((s) => s.motion);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={REDUCED[motion]}>{children}</MotionConfig>
    </LazyMotion>
  );
}
