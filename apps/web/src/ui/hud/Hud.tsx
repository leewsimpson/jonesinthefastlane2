/**
 * The HUD (FR-20, FR-13, ENG-14): who is playing, money, the hours left, every stat as a labelled bar, the four goal
 * rings and every rival's progress. Tapping the player card opens the full details.
 *
 * Desktop lays it out as the dashboard along the foot (art-direction §4 layout target): one row of cream cards that
 * never wraps. Mobile is a status bar over the board: who, the week, the score and money, then every stat as an icon,
 * number and thin bar; tapping it opens the details (goals and rivals).
 */
import type { GameState, PlayerState } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { Counter } from '../../fx/FxLayer.tsx';
import { content } from '../../game/engine.ts';
import { standingOf } from '../../game/standing.ts';
import { duration, money, percent } from '../../i18n/format.ts';
import { SettingsButton } from '../../settings/SettingsButton.tsx';
import { BustArt } from '../common/AtlasArt.tsx';
import { KEY_DETAILS } from '../common/hotkeys.ts';
import { Icon, type IconName } from '../common/Icon.tsx';
import { emotion, STAT_FILL, STAT_SVG, STAT_TONE, seatOf } from '../common/stats.ts';
import { Clock } from '../panels/WeekPanel.tsx';
import { GoalRings, Ring } from './GoalRings.tsx';

type BarStat = keyof typeof STAT_FILL;

/** A styled meter: the track has an ink border, so the fill needs no contrast of its own. */
function Meter({
  label,
  value,
  min = 0,
  max,
  text,
  fill,
  className = 'h-3 bg-surface',
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  text: string;
  fill: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled bar; <meter> can't be themed across browsers
    <div
      className={`overflow-hidden rounded-full border border-ink dark:border-cream/50 dark:bg-ink ${className}`}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
    >
      <div
        className="h-full motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  );
}

/** One stat in the mobile status bar: icon and number over a thin bar. */
function StatChip({
  icon,
  tone,
  label,
  text,
  meter,
}: {
  icon: IconName;
  tone: string;
  label: string;
  text: string;
  meter: { value: number; min?: number; max: number; fill: string };
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center justify-center gap-1">
        <Icon name={icon} size={16} className={`shrink-0 ${tone}`} />
        <span className="tabular font-bold text-sm leading-none">{text}</span>
      </span>
      <Meter label={label} text={text} className="h-1.5 bg-surface" {...meter} />
    </div>
  );
}

/**
 * One stat in the landscape dashboard, as the concept draws it: icon and label over a thick bar, the number under it
 * (art-direction §4: resource bars include icon, label and number).
 */
function StatColumn({ stat, value, label }: { stat: BarStat; value: number; label: string }) {
  return (
    <div className="flex min-w-[5.25rem] flex-1 flex-col justify-center gap-2 px-1.5 py-2">
      {/* The icon leads the label where there's room; on narrower screens it moves down beside the number, so the
          longest label ("Happiness") still fits at 14px (NFR-04). */}
      <span className="flex items-center gap-1">
        <Icon
          name={STAT_SVG[stat]}
          size={18}
          className={`hidden shrink-0 min-[1500px]:block ${STAT_TONE[stat]}`}
        />
        <span className="truncate font-display font-semibold text-sm leading-tight">{label}</span>
      </span>
      <Meter
        label={label}
        value={value}
        {...range(stat)}
        text={String(value)}
        fill={STAT_FILL[stat]}
        className="h-6 bg-slate/25"
      />
      <span className="flex items-center justify-center gap-1">
        <Icon
          name={STAT_SVG[stat]}
          size={18}
          className={`shrink-0 min-[1500px]:hidden ${STAT_TONE[stat]}`}
        />
        <span className="tabular font-bold font-display text-xl leading-none">{value}</span>
      </span>
    </div>
  );
}

/** A stat's range from balance (credit is not 0–100), for its bar. */
function range(stat: BarStat): { min: number; max: number } {
  const r = content.balance.statRanges[stat];
  return { min: r.min, max: r.max ?? 100 };
}

const BAR_STATS: readonly BarStat[] = ['energy', 'health', 'happiness', 'social', 'creditScore'];

/** Details, Settings, Quit: quiet controls, over the board on desktop or at the foot of the action sheet on mobile. */
export function HudToolbar({
  onDetails,
  onQuit,
  className = '',
}: {
  onDetails(): void;
  onQuit(): void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button
        type="button"
        className="btn btn-sm btn-ghost flex-1"
        onClick={onDetails}
        aria-keyshortcuts={KEY_DETAILS}
      >
        {t('hud.details')} <kbd>{KEY_DETAILS.toUpperCase()}</kbd>
      </button>
      <SettingsButton className="btn btn-sm btn-ghost flex-1" />
      <button type="button" className="btn btn-sm btn-ghost flex-1" onClick={onQuit}>
        {t('menu.quit')}
      </button>
    </div>
  );
}

/**
 * The week on a signboard over the town's corner, as the concept puts it: the week and the hours left at a glance.
 * The dashboard carries the same facts for assistive tech, so the sign is hidden from it.
 */
export function WeekSign({ state, me }: { state: GameState; me: PlayerState }) {
  const { t } = useTranslation();
  const limit = state.config.weekLimit;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none flex flex-col gap-0.5 rounded-md border-2 border-ink bg-cream px-3 py-1 text-ink shadow-[0_3px_0_var(--color-ink)]"
    >
      <span className="flex items-center gap-2 font-bold font-display text-lg leading-tight">
        <Icon name="calendar" size={20} className="text-brick" />
        {limit ? t('hud.weekOf', { week: state.week, limit }) : t('hud.week', { week: state.week })}
      </span>
      <span className="flex items-center gap-2 font-display text-sm leading-tight">
        <Icon name="clock" size={20} />
        {t('hud.leftThisWeek', { time: duration(me.timeLeft) })}
      </span>
    </div>
  );
}

export function Hud({
  state,
  me,
  wide,
  onDetails,
}: {
  state: GameState;
  me: PlayerState;
  wide: boolean;
  onDetails(): void;
}) {
  const { t } = useTranslation();
  const mine = standingOf(state, me);
  const seat = seatOf(state.players, me.id);
  const rivals = state.players.filter((p) => p.id !== me.id);
  const { weekMinutes } = content.balance;
  const limit = state.config.weekLimit;
  const weekText = limit
    ? t('hud.weekOf', { week: state.week, limit })
    : t('hud.week', { week: state.week });
  const mood = emotion(me.stats);

  /** The portrait in the seat's colour, with its shape, so the colour is never the only cue (NFR-04). */
  const portrait = (size: number) => (
    <span
      className="relative shrink-0 overflow-hidden rounded-md border border-ink bg-sky/40"
      style={{ width: size, height: size, boxShadow: `inset 0 -4px 0 ${seat.colour}` }}
      aria-hidden="true"
    >
      <BustArt avatar={seat.avatar} mood={mood} size={size} />
      <span
        className="absolute right-0.5 bottom-1.5 flex size-5 items-center justify-center rounded-full border border-ink text-ink text-sm leading-none"
        style={{ background: seat.colour }}
      >
        {seat.shape}
      </span>
    </span>
  );

  const rivalList = rivals.map((r) => {
    const s = standingOf(state, r);
    const rs = seatOf(state.players, r.id);
    return (
      <span key={r.id} className="flex items-center gap-1 text-sm">
        <Ring bp={s.score} colour={rs.colour} size={24} label={`${r.name} ${percent(s.score)}`}>
          <span className="text-xs">{rs.shape}</span>
        </Ring>
        <span className="max-w-28 truncate">{r.name}</span>
        <span className="tabular text-fg-muted">{percent(s.score)}</span>
      </span>
    );
  });

  const cash = (
    <span className="tabular font-bold font-display text-good leading-none">
      <span className="sr-only">{t('stat.cash')} </span>
      <Counter value={me.stats.cash} format={money} />
    </span>
  );

  if (wide)
    return (
      <header className="hud flex items-stretch gap-2">
        <button
          type="button"
          onClick={onDetails}
          className="card flex w-64 flex-none items-stretch overflow-hidden p-0 text-left hover:bg-butter/35 dark:hover:bg-cream/5"
          aria-label={t('hud.details')}
        >
          <span className="flex shrink-0 items-end overflow-hidden bg-sky/40">{portrait(80)}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex flex-col bg-teal-deep px-3 py-1 text-cream">
              <span className="truncate font-bold font-display text-lg leading-tight">
                {me.name}
              </span>
              <span className="truncate font-display text-sm">{weekText}</span>
            </span>
            <span className="flex flex-1 flex-col justify-center gap-1 px-3 py-1">
              <GoalRings progress={mine.progress} size={22} />
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="tabular font-bold text-sm">
                  {t('hud.score', { score: percent(mine.score) })}
                </span>
                {rivalList}
              </span>
            </span>
          </span>
        </button>

        <div className="card flex flex-none flex-col justify-center gap-1 px-3 py-2">
          <span className="font-display font-semibold text-sm">{t('hud.money')}</span>
          <span className="flex items-center gap-1.5 text-2xl">
            <Icon name="cash" size={24} className={STAT_TONE.cash} />
            {cash}
          </span>
        </div>

        <div className="card flex flex-none flex-col justify-center gap-1 px-3 py-2">
          <span className="font-display font-semibold text-sm">{t('hud.timeThisWeek')}</span>
          <span className="flex items-center gap-2">
            <Clock left={me.timeLeft} total={weekMinutes} size={32} label={false} />
            <span className="tabular font-bold font-display text-2xl leading-none">
              {duration(me.timeLeft)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm" title={t('stat.meals')}>
            <Icon name="meal" size={16} className={STAT_TONE.meals} />
            <span className="tabular font-bold">{me.mealsThisWeek}</span>
            <span className="text-fg-muted">{t('stat.meals')}</span>
          </span>
        </div>

        <div className="card flex min-w-0 flex-1 divide-x divide-ink/15 dark:divide-cream/15">
          {BAR_STATS.map((s) => (
            <StatColumn key={s} stat={s} value={me.stats[s]} label={t(`stat.${s}`)} />
          ))}
        </div>
      </header>
    );

  return (
    <header className="hud flex flex-col gap-2 border-ink border-b bg-surface-raised px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 dark:border-cream/30">
      <button
        type="button"
        onClick={onDetails}
        className="flex items-center gap-2 rounded-lg text-left"
        aria-label={t('hud.details')}
      >
        {portrait(40)}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold font-display text-lg leading-tight">
            {me.name}
          </span>
          <span className="block truncate text-fg-muted text-sm">
            {weekText}
            {' · '}
            {t('hud.score', { score: percent(mine.score) })}
          </span>
        </span>
        <span className="shrink-0 text-2xl">{cash}</span>
      </button>
      <div className="grid grid-cols-6 gap-2">
        <StatChip
          icon={STAT_SVG.time}
          tone={STAT_TONE.time}
          label={t('hud.time')}
          text={duration(me.timeLeft)}
          meter={{ value: me.timeLeft, max: weekMinutes, fill: 'var(--color-sky)' }}
        />
        {BAR_STATS.map((s) => (
          <StatChip
            key={s}
            icon={STAT_SVG[s]}
            tone={STAT_TONE[s]}
            label={t(`stat.${s}`)}
            text={String(me.stats[s])}
            meter={{ value: me.stats[s], ...range(s), fill: STAT_FILL[s] }}
          />
        ))}
      </div>
    </header>
  );
}
