/**
 * Plays an `Fx` over the board (ENG-01): numbers that float up, a banner with confetti for big moments, and a light
 * screen shake. Reduced motion keeps the numbers and the banner, still, and drops shake and confetti. Everything
 * here is decoration: the ticker under the action sheet is what screen readers hear.
 */
import { AnimatePresence, animate, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { money, signed, signedMoney } from '../i18n/format.ts';
import { t } from '../i18n/i18n.ts';
import { useReducedMotion } from '../settings/hooks.ts';
import { STAT_ICON, STAT_TONE } from '../ui/common/stats.ts';
import type { Fx, Moment } from './map.ts';

/** How long a batch stays on screen, in ms (ENG-03 keeps reveals under 1.5 s; the banner lingers a little longer). */
const POP_MS = 1_300;
const BANNER_MS = 2_200;
const CONFETTI = ['#ff5a4e', '#ffc23d', '#1fb5a8', '#5eb8ff', '#8e7cf0', '#7ee0a1'];

/** The banner line for a moment. */
export function momentText(m: Moment): string {
  switch (m.kind) {
    case 'hired':
    case 'promoted':
    case 'laidOff':
    case 'letGo':
      return t(`fx.${m.kind}`, { job: t(`job.${m.job}`) });
    case 'paid':
      return t('fx.paid', { amount: money(m.amount) });
    case 'credential':
      return t('fx.credential', { course: t(`course.${m.course}`) });
    case 'quest':
      return t('fx.quest', { quest: t(`quest.${m.quest}`) });
    case 'moved':
      return t('fx.moved', { home: t(`housing.${m.home}`) });
    case 'evicted':
      return t('fx.evicted', { home: t(`housing.${m.home}`) });
  }
}

/** Where the numbers appear in this layer's own coordinates: the anchor, shifted to the viewport when it is fixed. */
function popPoint(
  layer: HTMLElement | null,
  board: HTMLElement | null | undefined,
  anchor: { x: number; y: number } | undefined,
): { x: number; y: number } | null {
  if (!anchor) return null;
  if (!layer || !board || getComputedStyle(layer).position !== 'fixed') return anchor;
  const r = board.getBoundingClientRect();
  return { x: anchor.x + r.left, y: anchor.y + r.top };
}

const good = (m: Moment) => m.kind !== 'laidOff' && m.kind !== 'letGo' && m.kind !== 'evicted';

export function FxLayer({
  fx,
  id,
  shakeTarget,
  anchor,
  boardEl,
}: {
  fx: Fx;
  /** Changes once per batch. */
  id: number;
  shakeTarget: HTMLElement | null;
  /** Where the acted building is, in board pixels: the numbers float up from there. */
  anchor?: { x: number; y: number };
  /** The board, to place the anchor when this layer is fixed to the viewport (phone layout). */
  boardEl?: HTMLElement | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<{
    id: number;
    fx: Fx;
    at: { x: number; y: number } | null;
  } | null>(null);
  const [banner, setBanner] = useState<{ id: number; moment: Moment } | null>(null);

  // One run per batch id: fx changes with it. A batch with nothing to show leaves the last one to finish.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the batch id
  useEffect(() => {
    if (fx.pops.length === 0 && !fx.moment) return;
    setShown({ id, fx, at: popPoint(layer.current, boardEl, anchor) });
    if (fx.moment) setBanner({ id, moment: fx.moment });
    if (!reduced && shakeTarget && fx.shake !== 'none') {
      const a = fx.shake === 'big' ? 8 : 4;
      animate(shakeTarget, { x: [0, -a, a, -a / 2, a / 2, 0] }, { duration: 0.35 });
    }
  }, [id]);

  // Each shown batch and banner clears itself; a newer one restarts its own timer.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), POP_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  return (
    <div
      ref={layer}
      className="fx-layer pointer-events-none inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className={
          shown?.at
            ? 'absolute flex w-48 -translate-x-1/2 -translate-y-full flex-wrap justify-center gap-2'
            : 'absolute inset-x-0 top-3 flex flex-wrap justify-center gap-2'
        }
        style={shown?.at ? { left: shown.at.x, top: shown.at.y } : undefined}
      >
        <AnimatePresence>
          {shown?.fx.pops.map((p, i) => (
            <m.span
              key={`${shown.id}-${p.key}`}
              className={`chip font-bold text-base shadow ${p.tone === 'good' ? 'chip-good' : 'chip-bad'}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.8 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -24 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22, delay: i * 0.06 }}
            >
              {p.stat === 'cash' ? (
                signedMoney(p.delta)
              ) : (
                <>
                  {signed(p.delta)}{' '}
                  <span className={STAT_TONE[p.stat as keyof typeof STAT_TONE]}>
                    {STAT_ICON[p.stat as keyof typeof STAT_ICON]}
                  </span>
                </>
              )}
            </m.span>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {banner && (
          <m.div
            key={banner.id}
            className="absolute inset-x-0 top-[12%] flex justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {!reduced &&
              good(banner.moment) &&
              CONFETTI.flatMap((colour, c) =>
                [0, 1, 2].map((k) => {
                  const n = c * 3 + k;
                  const angle = (n / 18) * Math.PI * 2;
                  return (
                    <m.span
                      key={`${colour}-${k}`}
                      className="absolute size-2.5 rounded-sm"
                      style={{ background: colour }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                      animate={{
                        x: Math.cos(angle) * (110 + (n % 4) * 25),
                        y: Math.sin(angle) * (80 + (n % 3) * 25) + 60,
                        rotate: 180 + n * 40,
                        opacity: 0,
                      }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                    />
                  );
                }),
              )}
            <m.p
              className={`card max-w-xs px-4 py-3 text-center font-bold font-display text-xl shadow-[0_4px_0_var(--color-ink)] ${good(banner.moment) ? '' : 'text-bad'}`}
              initial={reduced ? false : { scale: 0.6, rotate: -4 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16 }}
            >
              {momentText(banner.moment)}
            </m.p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A number that springs to its new value (ENG-01 counter springs); still under reduced motion. */
export function Counter({ value, format }: { value: number; format(n: number): string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  // Only a new target restarts the tween; it starts from wherever the number is now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: shown is the tween's start, not a trigger
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(shown, value, {
      duration: 0.6,
      ease: 'easeOut',
      // Whole dollars while it runs, the exact amount at the end.
      onUpdate: (v) => setShown(Math.round(v / 100) * 100),
      onComplete: () => setShown(value),
    });
    return () => controls.stop();
  }, [value, reduced]);
  return <>{format(shown)}</>;
}
