/**
 * An action's preview as chips (FR-03, FR-21): time, money, stat effects, random ranges, modifiers and ledger
 * moves, all before the player commits.
 */
import type { ChoicePlan, Plan } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { placeLabel } from '../../game/copy.ts';
import { duration, money, percent, signed, signedMoney } from '../../i18n/format.ts';
import { STAT_ICON, STAT_TONE } from './stats.ts';

function Chip({ children, tone = '' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function PlanChips({ plan }: { plan: Plan | ChoicePlan }) {
  const { t } = useTranslation();
  const chips: React.ReactNode[] = [];
  if (plan.time > 0)
    chips.push(
      <Chip key="time">
        <span aria-hidden="true" className={STAT_TONE.time}>
          {STAT_ICON.time}
        </span>{' '}
        <span className="sr-only">{t('stat.time')} </span>
        {duration(plan.time)}
      </Chip>,
    );
  if (plan.money > 0)
    chips.push(<Chip key="money">{t('plan.cost', { money: money(plan.money) })}</Chip>);
  for (const e of plan.effects) {
    if (e.delta === 0) continue;
    chips.push(
      e.stat === 'cash' ? (
        <Chip key={`e-${e.stat}`} tone={e.delta > 0 ? 'chip-good' : ''}>
          {signedMoney(e.delta)}
        </Chip>
      ) : (
        <Chip key={`e-${e.stat}`} tone={e.delta > 0 ? 'chip-good' : 'chip-bad'}>
          {signed(e.delta)}{' '}
          <span aria-hidden="true" className={STAT_TONE[e.stat]}>
            {STAT_ICON[e.stat]}
          </span>
          <span className="sr-only"> {t(`stat.${e.stat}`)}</span>
        </Chip>
      ),
    );
  }
  for (const o of plan.outcomes) {
    const fmt = o.stat === 'cash' ? signedMoney : signed;
    chips.push(
      <Chip key={`o-${o.stat}`} tone="chip-random">
        {t('plan.range', { min: fmt(o.min), max: fmt(o.max) })}{' '}
        {o.stat !== 'cash' && (
          <>
            <span aria-hidden="true" className={STAT_TONE[o.stat]}>
              {STAT_ICON[o.stat]}
            </span>
            <span className="sr-only"> {t(`stat.${o.stat}`)}</span>
          </>
        )}
      </Chip>,
    );
  }
  for (const m of plan.modifiers)
    chips.push(
      <Chip key={`m-${m.source}-${m.target}`} tone={m.bp < 0 ? 'chip-bad' : 'chip-good'}>
        {t('plan.modifier', {
          bp: (m.bp > 0 ? '+' : '−') + percent(Math.abs(m.bp)),
          target: t(`plan.target.${m.target}`),
          source: t(m.source),
        })}
      </Chip>,
    );
  for (const [i, tr] of plan.transfers.entries())
    chips.push(
      <Chip key={`t-${i}`}>
        {t('plan.transfer', {
          amount: money(tr.amount),
          from: placeLabel(tr.from),
          to: placeLabel(tr.to),
        })}
      </Chip>,
    );
  if ('nextWeekMinutes' in plan) {
    if (plan.nextWeekMinutes !== 0)
      chips.push(
        <Chip key="nw" tone={plan.nextWeekMinutes > 0 ? 'chip-good' : 'chip-bad'}>
          {t('plan.nextWeek', {
            time: (plan.nextWeekMinutes > 0 ? '+' : '') + duration(plan.nextWeekMinutes),
          })}
        </Chip>,
      );
    if (plan.jobRating !== 0)
      chips.push(
        <Chip key="jr" tone={plan.jobRating > 0 ? 'chip-good' : 'chip-bad'}>
          {t('plan.jobRating', { delta: signed(plan.jobRating) })}
        </Chip>,
      );
    if (plan.layoffWarning)
      chips.push(
        <Chip key="lw" tone="chip-bad">
          {t('plan.layoffWarning')}
        </Chip>,
      );
    if (plan.gigBanWeeks > 0)
      chips.push(
        <Chip key="gb" tone="chip-bad">
          {t('plan.gigBan', { count: plan.gigBanWeeks })}
        </Chip>,
      );
  }
  if (chips.length === 0) chips.push(<Chip key="free">{t('plan.free')}</Chip>);
  return <span className="flex flex-wrap gap-1">{chips}</span>;
}
