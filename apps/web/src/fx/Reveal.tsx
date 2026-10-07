/**
 * Reveal animations for the week wrap-up (ENG-03): short (≤ 1.5 s), and skippable: a click anywhere on the page
 * sets `skip`, which re-renders every reveal in its final state. Reduced motion shows them finished.
 */
import { m } from 'motion/react';
import { createContext, type ReactNode, useContext } from 'react';
import { useReducedMotion } from '../settings/hooks.ts';

/** The longest any reveal may take, in seconds (ENG-03). */
export const REVEAL_MAX_S = 1.5;

export const SkipReveal = createContext(false);

/** True when reveals should show their end state at once. */
export function useInstant(): boolean {
  const skip = useContext(SkipReveal);
  return useReducedMotion() || skip;
}

/** A stamp: lands big and settles, for promotions and other headline lines. */
export function Stamp({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const instant = useInstant();
  return (
    <m.span
      key={instant ? 'done' : 'play'}
      className="inline-block"
      initial={instant ? false : { scale: 2.2, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 14, delay }}
    >
      {children}
    </m.span>
  );
}

/** Fades and slides a block in, `index` steps after the page opens. */
export function Rise({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const instant = useInstant();
  return (
    <m.div
      key={instant ? 'done' : 'play'}
      initial={instant ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.12, REVEAL_MAX_S - 0.3) }}
    >
      {children}
    </m.div>
  );
}

/**
 * A card that flips from its back to its face (ENG-03 event card flips). `onShown` fires once the face is up, so
 * choices can wait for it.
 */
export function FlipCard({
  back,
  front,
  onShown,
}: {
  back: ReactNode;
  front: ReactNode;
  onShown?(): void;
}) {
  const instant = useInstant();
  return (
    <div className="relative [perspective:900px]">
      <m.div
        key={instant ? 'done' : 'play'}
        className="relative [transform-style:preserve-3d]"
        initial={instant ? false : { rotateY: 180 }}
        animate={{ rotateY: 0 }}
        transition={{ duration: 0.7, ease: [0.3, 0.7, 0.2, 1.05], delay: 0.15 }}
        onAnimationComplete={() => onShown?.()}
      >
        <div className="[backface-visibility:hidden]">{front}</div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {back}
        </div>
      </m.div>
    </div>
  );
}
