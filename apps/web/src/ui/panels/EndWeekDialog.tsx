/**
 * The end-week check (FR-03, FR-04): ending the week with no meal or with rent short gets a second look first, with
 * what it will cost. A clean week ends straight away. Enter confirms, Escape keeps playing.
 */
import type { Plan, StatDelta } from '@fastlane/engine';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { content } from '../../game/engine.ts';
import type { WeekNeeds } from '../../game/guide.ts';
import { duration, money } from '../../i18n/format.ts';
import { PlanChips } from '../common/PlanChips.tsx';

/** Whether ending the week now needs a second look. */
export function endWeekWarnings(needs: WeekNeeds): { hungry: boolean; rentShort: boolean } {
  return { hungry: needs.meals === 0, rentShort: needs.rentShort > 0 };
}

export function EndWeekDialog({
  open,
  needs,
  timeLeft,
  onKeep,
  onEnd,
}: {
  open: boolean;
  needs: WeekNeeds;
  timeLeft: number;
  onKeep(): void;
  onEnd(): void;
}) {
  const { t } = useTranslation();
  const warn = endWeekWarnings(needs);
  const hunger: Plan = {
    time: 0,
    money: 0,
    effects: Object.entries(content.balance.hungerPenalty).map(
      ([stat, delta]) => ({ stat, delta }) as StatDelta,
    ),
    modifiers: [],
    outcomes: [],
    transfers: [],
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onKeep()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
              e.preventDefault();
              onEnd();
            }
          }}
        >
          <Dialog.Title className="font-bold font-display text-2xl">
            {t('confirm.title')}
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-3 flex flex-col gap-3">
              {warn.hungry && (
                <div className="flex flex-col gap-1">
                  <p>{t('confirm.hungry')}</p>
                  <PlanChips plan={hunger} />
                </div>
              )}
              {warn.rentShort && <p>{t('confirm.rent', { short: money(needs.rentShort) })}</p>}
              {timeLeft > 0 && (
                <p className="text-fg-muted text-sm">
                  {t('confirm.time', { time: duration(timeLeft) })}
                </p>
              )}
            </div>
          </Dialog.Description>
          <div className="mt-4 flex gap-2">
            <Dialog.Close className="btn flex-1">{t('confirm.keep')}</Dialog.Close>
            <button type="button" className="btn btn-primary flex-1" onClick={onEnd}>
              {t('confirm.end')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
