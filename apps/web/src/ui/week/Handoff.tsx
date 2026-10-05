/** Hotseat handoff (FR-06): covers the screen until the next human takes the device. */
import { useTranslation } from 'react-i18next';
import { seatOf } from '../common/stats.ts';

export function Handoff({
  players,
  player,
  name,
  onStart,
}: {
  players: readonly { id: string; controller: string }[];
  player: string;
  name: string;
  onStart(): void;
}) {
  const { t } = useTranslation();
  const seat = seatOf(players, player);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-surface p-6 text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
    >
      <span
        className="flex size-20 items-center justify-center rounded-full border-4 border-ink text-4xl text-ink"
        style={{ background: seat.colour }}
        aria-hidden="true"
      >
        {seat.shape}
      </span>
      <h1 id="handoff-title" className="font-bold font-display text-3xl">
        {t('week.handoff', { name })}
      </h1>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onStart}
        // biome-ignore lint/a11y/noAutofocus: the only action on the screen
        autoFocus
      >
        {t('week.handoffStart', { name })}
      </button>
    </div>
  );
}
