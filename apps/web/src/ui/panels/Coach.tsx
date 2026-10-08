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
  canGo,
  onGo,
  onSkip,
}: {
  step: CoachStep;
  /** In the sheet on small boards: tighter, no drop shadow. */
  compact?: boolean;
  /** Whether the step's destination can be reached now. */
  canGo: boolean;
  onGo(location: string): void;
  onSkip(): void;
}) {
  const { t } = useTranslation();

  // Declarative: CSS outlines `[data-coach=<target>]` while the root names it, including controls that mount later.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.coachStep = step.target;
    return () => {
      delete root.dataset.coachStep;
    };
  }, [step.target]);

  return (
    <aside
      className={
        compact
          ? 'mx-3 mt-2 flex flex-col gap-1 rounded-xl border-2 border-coral bg-surface p-2'
          : 'card pointer-events-auto flex w-full max-w-md flex-col gap-1 p-3 shadow-[0_4px_0_var(--color-ink)]'
      }
      aria-labelledby="coach-heading"
      data-testid="coach"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="coach-heading" className="font-bold text-bad text-xs uppercase tracking-wide">
          {t('coach.step', { n: step.n, total: COACH_STEPS.length })}
        </h2>
        <button
          type="button"
          className="-my-2 px-1 py-2 text-fg-muted text-sm underline"
          onClick={onSkip}
        >
          {step.id === 'paid' ? t('coach.done') : t('coach.skip')}
        </button>
      </div>
      <p role="status" className="leading-snug">
        {t(`coach.${step.id}`, {
          location: step.location ? t(`location.${step.location}`) : '',
        })}
      </p>
      {step.target === 'go' && step.location && (
        <button
          type="button"
          className="btn btn-sm btn-primary self-start"
          disabled={!canGo}
          onClick={() => step.location && onGo(step.location)}
          data-coach="go"
        >
          {t('week.go', { location: t(`location.${step.location}`) })}
        </button>
      )}
    </aside>
  );
}
