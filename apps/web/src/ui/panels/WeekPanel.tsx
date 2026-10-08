/**
 * The week panel (ENG-20, FR-03, FR-02). It sits in the open middle of the board, where the original game kept its
 * clock and messages, and holds:
 * - a clock face for the hours left this week
 * - this week's needs: a meal, rent, work hours
 * - one suggested next step with a Go button
 * - the transport mode a click on the board uses
 * On a board too small for it, a compact version sits at the top of the action sheet.
 */
import type { GameState, PlayerState, Preview } from '@fastlane/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { content } from '../../game/engine.ts';
import { type Hint, pickTrip, type WeekNeeds } from '../../game/guide.ts';
import { duration, money } from '../../i18n/format.ts';
import { STAT_ICON } from '../common/stats.ts';

export function Clock({ left, total, size }: { left: number; total: number; size: number }) {
  const { t } = useTranslation();
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / total));
  const low = frac < 0.2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-surface stroke-ink/15"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={low ? 'stroke-coral' : 'stroke-sky'}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="tabular whitespace-nowrap font-bold font-display"
          style={{ fontSize: Math.round(size * 0.2) }}
        >
          {duration(left)}
        </span>
        <span className="text-fg-muted" style={{ fontSize: Math.round(size * 0.15) }}>
          {t('week.left')}
        </span>
      </div>
    </div>
  );
}

function Need({ ok, icon, text }: { ok: boolean; icon: string; text: string }) {
  return (
    <li className={`flex items-start gap-1.5 text-sm leading-snug ${ok ? '' : 'font-bold'}`}>
      <span aria-hidden="true" className={ok ? 'text-good' : 'text-bad'}>
        {ok ? '✓' : '!'}
      </span>
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{ok ? '' : '! '}</span>
      <span>{text}</span>
    </li>
  );
}

export function needLines(
  t: TFunction,
  needs: WeekNeeds,
): { id: string; ok: boolean; icon: string; text: string }[] {
  const lines = [
    {
      id: 'food',
      ok: needs.meals > 0,
      icon: STAT_ICON.meals,
      text: needs.meals > 0 ? t('week.fed', { count: needs.meals }) : t('week.hungry'),
    },
  ];
  if (needs.rentDue > 0)
    lines.push({
      id: 'rent',
      ok: needs.rentShort === 0,
      icon: '🏠',
      text:
        needs.rentShort === 0
          ? t('week.rentOk', { rent: money(needs.rentDue) })
          : t('week.rentShort', { rent: money(needs.rentDue), short: money(needs.rentShort) }),
    });
  lines.push(
    needs.work
      ? {
          id: 'work',
          ok: true,
          icon: '💼',
          text:
            needs.work.minutesLeft > 0
              ? t('week.workLeft', {
                  time: duration(needs.work.minutesLeft),
                  location: t(`location.${needs.work.location}`),
                })
              : t('week.workDone'),
        }
      : { id: 'work', ok: false, icon: '💼', text: t('week.noJob') },
  );
  return lines;
}

export interface WeekPanelProps {
  state: GameState;
  me: PlayerState;
  previews: readonly Preview[];
  needs: WeekNeeds;
  hint: Hint;
  mode: string;
  hover: string | null;
  canAct: boolean;
  compact?: boolean;
  onMode(mode: string): void;
  onGo(dest: string): void;
  onEndWeek(): void;
}

export function WeekPanel({
  state,
  me,
  previews,
  needs,
  hint,
  mode,
  hover,
  canAct,
  compact = false,
  onMode,
  onGo,
  onEndWeek,
}: WeekPanelProps) {
  const { t } = useTranslation();
  const modes = content.city.board.transportModes.map((m) => m.id);
  const usable = new Set(
    previews.flatMap((p) => (p.action.type === 'travel' && p.available ? [p.action.mode] : [])),
  );
  const limit = state.config.weekLimit;
  const tripTo = (dest: string | null) => (dest ? pickTrip(previews, dest, mode) : null);
  const hintTrip = tripTo(hint.dest);
  const hoverTrip = hover && hover !== me.location ? tripTo(hover) : null;
  const params = {
    ...hint.params,
    location: hint.params.location ? t(`location.${hint.params.location}`) : '',
    short: typeof hint.params.short === 'number' ? money(hint.params.short) : '',
  };
  const tripText = (trip: NonNullable<typeof hintTrip>) =>
    [
      t(`transport.${trip.action.mode}`),
      duration(trip.plan.time),
      trip.plan.money > 0 ? money(trip.plan.money) : t('week.free'),
    ].join(' · ');

  const goButton = hint.dest && (
    <button
      type="button"
      className={`btn btn-sm btn-primary ${compact ? 'flex-1' : 'shrink-0'}`}
      disabled={!canAct || !hintTrip}
      onClick={() => hint.dest && onGo(hint.dest)}
    >
      {t('week.go', { location: t(`location.${hint.dest}`) })}
    </button>
  );
  const endButton = (hint.id === 'timeUp' || hint.id === 'endWeek') && (
    <button
      type="button"
      className={`btn btn-sm btn-primary ${compact ? 'flex-1' : 'shrink-0'}`}
      disabled={!canAct}
      onClick={onEndWeek}
    >
      {t('sheet.endWeek')}
    </button>
  );
  const hintText = (
    <span className="leading-snug" data-testid="next-step">
      {t(`hint.${hint.id}`, params)}
    </span>
  );

  const modePicker = (
    <label className="flex shrink-0 items-center gap-1 text-sm">
      <span className="text-fg-muted">{t('week.mode')}</span>
      <select className="input py-0! text-sm" value={mode} onChange={(e) => onMode(e.target.value)}>
        {modes.map((m) => (
          <option key={m} value={m} disabled={!usable.has(m)}>
            {t(`transport.${m}`)}
          </option>
        ))}
      </select>
    </label>
  );

  // Phones and small boards: a card at the top of the action sheet with the week's needs, the next step, its Go
  // button and the mode a tap on the board travels by.
  if (compact)
    return (
      <section
        className="mx-3 mt-2 flex flex-col gap-2 rounded-xl border-2 border-mustard bg-mustard/15 p-2"
        aria-label={t('week.next')}
      >
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {needLines(t, needs).map((n) => (
            <Need key={n.id} ok={n.ok} icon={n.icon} text={n.text} />
          ))}
        </ul>
        {hintText}
        <div className="flex flex-wrap items-center gap-2">
          {goButton}
          {endButton}
          {modePicker}
        </div>
      </section>
    );

  return (
    <section
      className="card flex max-h-full w-full flex-col gap-2 overflow-y-auto p-3 shadow-[0_4px_0_var(--color-ink)]"
      aria-label={t('week.title')}
    >
      <div className="flex items-center gap-3">
        <Clock left={me.timeLeft} total={content.balance.weekMinutes} size={64} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="font-bold font-display text-lg leading-tight">
            {limit
              ? t('hud.weekOf', { week: state.week, limit })
              : t('hud.week', { week: state.week })}
          </div>
          {modePicker}
        </div>
      </div>
      <ul className="flex flex-col gap-0.5">
        {needLines(t, needs).map((n) => (
          <Need key={n.id} ok={n.ok} icon={n.icon} text={n.text} />
        ))}
      </ul>
      {hoverTrip ? (
        <div className="rounded-xl border-2 border-sky bg-sky/10 p-2 text-sm" aria-live="polite">
          <div className="font-bold">{t('week.hoverGo', { location: t(`location.${hover}`) })}</div>
          <div className="text-fg-muted text-xs">{tripText(hoverTrip)}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-xl border-2 border-mustard bg-mustard/15 p-2 text-sm">
          <span className="font-bold text-fg-muted text-xs uppercase tracking-wide">
            {t('week.next')}
          </span>
          {hintText}
          {(goButton || endButton) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {goButton}
              {endButton}
              {hintTrip && <span className="text-fg-muted text-xs">{tripText(hintTrip)}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
