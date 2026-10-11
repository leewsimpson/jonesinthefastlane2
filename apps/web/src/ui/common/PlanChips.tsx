/**
 * An action's preview as chips (FR-03, FR-21): time, money, stat effects, random ranges, modifiers and ledger
 * moves, all before the player commits.
 */
import type { StatKey } from '@fastlane/content/keys';
import type { ChoicePlan, Plan } from '@fastlane/engine';
import { cloneElement } from 'react';
import { useTranslation } from 'react-i18next';
import { placeLabel } from '../../game/copy.ts';
import { duration, money, percent, signed, signedMoney } from '../../i18n/format.ts';
import { STAT_ICON, STAT_TONE } from './stats.ts';

/** Bare effects (action rows, art-direction §4): plain coloured text with its sign, no pill around each one. */
const BARE_TONE: Record<string, string> = {
  '': 'text-fg',
  'chip-good': 'text-good',
  'chip-bad': 'text-bad',
  'chip-random': 'text-fg-muted italic',
};

function Chip({
  children,
  tone = '',
  bare = false,
}: {
  children: React.ReactNode;
  tone?: string;
  bare?: boolean;
}) {
  if (bare)
    return (
      <span
        className={`inline-flex items-center gap-0.5 font-bold text-sm wide:text-base ${BARE_TONE[tone]}`}
      >
        {children}
      </span>
    );
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function PlanChips({
  plan,
  bare = false,
  labelled = false,
  showTime = true,
  align = 'start',
}: {
  plan: Plan | ChoicePlan;
  /** Plain text instead of pills, for dense action rows. */
  bare?: boolean;
  /** Name each stat in words beside its icon ("+10 Energy"), where the row has room. */
  labelled?: boolean;
  /** Off where the time is shown beside the label. */
  showTime?: boolean;
  /** `end` right-aligns the effects, for a row's right-hand column. */
  align?: 'start' | 'end';
}) {
  const { t } = useTranslation();
  const chips: React.ReactNode[] = [];
  if (plan.time > 0 && showTime)
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
    chips.push(
      <Chip key="money" tone={bare ? 'chip-bad' : ''}>
        {t('plan.cost', { money: money(plan.money) })}
      </Chip>,
    );
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
          {labelled ? (
            <span>{t(`stat.${e.stat}`)}</span>
          ) : (
            <>
              <span aria-hidden="true" className={STAT_TONE[e.stat]}>
                {STAT_ICON[e.stat]}
              </span>
              <span className="sr-only"> {t(`stat.${e.stat}`)}</span>
            </>
          )}
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
  if (chips.length === 0 && (showTime || plan.time === 0))
    chips.push(<Chip key="free">{t('plan.free')}</Chip>);
  if (chips.length === 0) return null;
  // Every chip takes the same `bare` flag.
  const shown = bare ? chips.map((c) => (isChip(c) ? cloneElement(c, { bare: true }) : c)) : chips;
  return (
    <span
      className={`flex ${labelled ? 'flex-col' : 'flex-wrap'} ${bare ? 'gap-x-3 gap-y-0.5' : 'gap-1'} ${
        align === 'end' ? (labelled ? 'items-end' : 'justify-end') : ''
      }`}
    >
      {shown}
    </span>
  );
}

function isChip(node: React.ReactNode): node is React.ReactElement<{ bare?: boolean }> {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === Chip;
}

/** What a home does to the player every week (FR-03): "+3 ⚡/wk". Nothing for a home without weekly effects. */
export function WeeklyChips({ effects }: { effects: Partial<Record<StatKey, number>> }) {
  const { t } = useTranslation();
  const chips = Object.entries(effects).filter(([, delta]) => delta !== 0) as [StatKey, number][];
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map(([stat, delta]) => (
        <Chip key={stat} tone={delta > 0 ? 'chip-good' : 'chip-bad'}>
          {signed(delta)}{' '}
          <span aria-hidden="true" className={STAT_TONE[stat]}>
            {STAT_ICON[stat]}
          </span>
          <span className="sr-only"> {t(`stat.${stat}`)}</span>
          {t('plan.wk')}
        </Chip>
      ))}
    </span>
  );
}
