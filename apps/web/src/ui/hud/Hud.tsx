/**
 * The HUD (FR-20, FR-13, ENG-14): cash, Time and Energy bars, compact stats, the four goal rings and every rival's
 * progress. Tapping it opens the full details.
 */
import type { GameState, PlayerState } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { content } from '../../game/engine.ts';
import { standingOf } from '../../game/standing.ts';
import { duration, money, percent } from '../../i18n/format.ts';
import { SettingsButton } from '../../settings/SettingsButton.tsx';
import { KEY_DETAILS } from '../common/hotkeys.ts';
import { STAT_ICON, STAT_TONE, seatOf } from '../common/stats.ts';
import { GoalRings, Ring } from './GoalRings.tsx';

function Bar({
  label,
  icon,
  tone,
  value,
  max,
  text,
}: {
  label: string;
  icon: string;
  tone: string;
  value: number;
  max: number;
  text: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={`w-5 text-center font-bold ${tone}`}>
        {icon}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: a styled bar; <meter> can't be themed across browsers */}
      <div
        className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-surface dark:border-cream/60"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
      >
        <div
          className={`h-full bg-current ${tone} motion-safe:transition-[width] motion-safe:duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular w-14 text-right text-sm">{text}</span>
    </div>
  );
}

function Stat({
  stat,
  value,
}: {
  stat: 'health' | 'happiness' | 'social' | 'creditScore';
  value: number;
}) {
  const { t } = useTranslation();
  return (
    <span className="chip" title={t(`stat.${stat}`)}>
      <span aria-hidden="true" className={STAT_TONE[stat]}>
        {STAT_ICON[stat]}
      </span>
      <span className="sr-only">{t(`stat.${stat}`)}</span>
      <span className="tabular">{value}</span>
    </span>
  );
}

export function Hud({
  state,
  me,
  onDetails,
  onQuit,
}: {
  state: GameState;
  me: PlayerState;
  onDetails(): void;
  onQuit(): void;
}) {
  const { t } = useTranslation();
  const mine = standingOf(state, me);
  const seat = seatOf(state.players, me.id);
  const rivals = state.players.filter((p) => p.id !== me.id);
  const { weekMinutes } = content.balance;
  const limit = state.config.weekLimit;

  return (
    <header className="hud flex flex-col gap-2 border-ink border-b-2 bg-surface-raised p-2 sm:p-3 dark:border-cream/30">
      <div className="flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-full border-2 border-ink font-bold text-ink"
          style={{ background: seat.colour }}
          aria-hidden="true"
        >
          {seat.shape}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold font-display leading-tight">{me.name}</div>
          <div className="text-fg-muted text-xs">
            {limit
              ? t('hud.weekOf', { week: state.week, limit })
              : t('hud.week', { week: state.week })}
            {' · '}
            {t('hud.at', { location: t(`location.${me.location}`) })}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular font-bold font-display text-teal text-xl leading-none">
            <span className="sr-only">{t('stat.cash')} </span>
            {money(me.stats.cash)}
          </div>
          <button
            type="button"
            className="text-fg-muted text-xs underline"
            onClick={onDetails}
            aria-keyshortcuts={KEY_DETAILS}
          >
            {t('hud.details')} <kbd>{KEY_DETAILS.toUpperCase()}</kbd>
          </button>
          <SettingsButton className="ml-2 text-fg-muted text-xs underline" />
          <button type="button" className="ml-2 text-fg-muted text-xs underline" onClick={onQuit}>
            {t('menu.quit')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 wide:grid-cols-1">
        <Bar
          label={t('hud.time')}
          icon={STAT_ICON.time}
          tone={STAT_TONE.time}
          value={me.timeLeft}
          max={weekMinutes}
          text={duration(me.timeLeft)}
        />
        <Bar
          label={t('stat.energy')}
          icon={STAT_ICON.energy}
          tone={STAT_TONE.energy}
          value={me.stats.energy}
          max={100}
          text={String(me.stats.energy)}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <Stat stat="health" value={me.stats.health} />
        <Stat stat="happiness" value={me.stats.happiness} />
        <Stat stat="social" value={me.stats.social} />
        <Stat stat="creditScore" value={me.stats.creditScore} />
        <span className="chip" title={t('stat.meals')}>
          <span aria-hidden="true">{STAT_ICON.meals}</span>
          <span className="sr-only">{t('stat.meals')}</span>
          <span className="tabular">{me.mealsThisWeek}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onDetails}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg text-left"
        aria-label={t('hud.details')}
      >
        <GoalRings progress={mine.progress} size={34} />
        <span className="flex flex-col gap-1">
          <span className="tabular font-bold text-sm">
            {t('hud.score', { score: percent(mine.score) })}
          </span>
          {rivals.map((r) => {
            const s = standingOf(state, r);
            const rs = seatOf(state.players, r.id);
            return (
              <span key={r.id} className="flex items-center gap-1 text-sm">
                <Ring
                  bp={s.score}
                  colour={rs.colour}
                  size={22}
                  label={`${r.name} ${percent(s.score)}`}
                >
                  <span className="text-[9px]">{rs.shape}</span>
                </Ring>
                <span className="max-w-24 truncate">{r.name}</span>
                <span className="tabular text-fg-muted">{percent(s.score)}</span>
              </span>
            );
          })}
        </span>
      </button>
    </header>
  );
}
