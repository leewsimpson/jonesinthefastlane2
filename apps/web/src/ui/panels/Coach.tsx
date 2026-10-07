/**
 * The week-1 coach card (ENG-20): the current step from `coachStep`, with the control it talks about outlined
 * (`data-coach` on that element). Screen readers hear each new step. "Skip" ends it for this game; the settings
 * turn it off for every game.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { COACH_STEPS, type CoachStep } from '../../game/coach.ts';

export function Coach({
  step,
  compact = false,
  onSkip,
}: {
  step: CoachStep;
  /** In the sheet on small boards: tighter, no drop shadow. */
  compact?: boolean;
  onSkip(): void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const els = document.querySelectorAll(`[data-coach="${step.target}"]`);
    for (const el of els) el.classList.add('coach-target');
    return () => {
      for (const el of els) el.classList.remove('coach-target');
    };
  });

  return (
    <aside
      className={
        compact
          ? 'mx-3 mt-2 flex flex-col gap-0.5 rounded-xl border-2 border-coral bg-surface px-2 py-1.5 text-sm'
          : 'card pointer-events-auto flex w-full max-w-md flex-col gap-1 p-3 shadow-[0_4px_0_var(--color-ink)]'
      }
      aria-labelledby="coach-heading"
      data-testid="coach"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="coach-heading" className="font-bold text-bad text-xs uppercase tracking-wide">
          {t('coach.step', { n: step.n, total: COACH_STEPS.length })}
        </h2>
        <button type="button" className="text-fg-muted text-xs underline" onClick={onSkip}>
          {step.id === 'paid' ? t('coach.done') : t('coach.skip')}
        </button>
      </div>
      <p role="status" className="leading-snug">
        {t(`coach.${step.id}`, {
          location: step.location ? t(`location.${step.location}`) : '',
        })}
      </p>
    </aside>
  );
}
