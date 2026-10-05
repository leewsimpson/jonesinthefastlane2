/**
 * What the last action did (tech-stack §2: the engine reports events, the UI presents them). Phase 5 adds the juice;
 * this is the plain readout, announced to screen readers.
 */
import type { DomainEvent, GameState, RuleError } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { playerName } from '../../game/copy.ts';
import { statTotals } from '../../game/report.ts';
import { duration, money, signed, signedMoney } from '../../i18n/format.ts';
import { STAT_ICON, STAT_TONE } from '../common/stats.ts';

export function Ticker({
  events,
  state,
  player,
  error,
}: {
  events: readonly DomainEvent[];
  state: GameState;
  player: string;
  error: RuleError | null;
}) {
  const { t } = useTranslation();
  const lines: string[] = [];
  let cash = 0;
  for (const e of events) {
    if ('player' in e && e.player !== player) continue;
    switch (e.type) {
      case 'travelled':
        lines.push(
          t('feed.travelled', {
            name: playerName(state, e.player),
            location: t(`location.${e.to}`),
            mode: t(`transport.${e.mode}`),
            time: duration(e.minutes),
          }),
        );
        break;
      case 'actionPerformed':
        lines.push(
          t('feed.action', { action: t(`action.${e.actionId}`), time: duration(e.minutes) }),
        );
        break;
      case 'jobChanged':
        lines.push(t(`week.job.${e.change}`, { job: t(`job.${e.job}`) }));
        break;
      case 'moved':
        lines.push(t('week.moved', { home: t(`housing.${e.to}`) }));
        break;
      case 'credentialEarned':
        lines.push(t('week.credential', { course: t(`course.${e.course}`) }));
        break;
      case 'subscriptionAudit':
        lines.push(t('week.audit', { weekly: money(e.weekly) }));
        break;
      case 'gigDeactivated':
        lines.push(t('week.gigBan', { weeks: e.weeks }));
        break;
      case 'questCompleted':
        lines.push(t('week.questCompleted', { quest: t(`quest.${e.quest}`) }));
        break;
      case 'statChanged':
        if (e.stat === 'cash') cash += e.to - e.from;
        break;
    }
  }
  const stats = statTotals(events, player);
  return (
    <div className="min-h-7 px-3 text-sm" aria-live="polite" role="status">
      {error && <p className="font-bold text-coral">{t(`error.${error.code}`)}</p>}
      {lines.length > 0 && (
        <p className="flex flex-wrap items-center gap-1">
          <span>{lines.join(' · ')}</span>
          {cash !== 0 && (
            <span className={`chip ${cash > 0 ? 'chip-good' : ''}`}>{signedMoney(cash)}</span>
          )}
          {[...stats].map(([stat, delta]) => (
            <span key={stat} className={`chip ${delta > 0 ? 'chip-good' : 'chip-bad'}`}>
              {signed(delta)}{' '}
              <span aria-hidden="true" className={STAT_TONE[stat as keyof typeof STAT_TONE]}>
                {STAT_ICON[stat as keyof typeof STAT_ICON]}
              </span>
              <span className="sr-only"> {t(`stat.${stat}`)}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
