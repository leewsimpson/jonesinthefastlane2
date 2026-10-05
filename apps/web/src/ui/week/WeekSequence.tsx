/**
 * The end-of-week sequence (FR-05, ENG-10, ENG-13, ENG-14): bills and life → weekend event card with choices →
 * news → goal progress → Jones's feed → next-week teaser. It can't be dismissed; Enter moves on, and number keys
 * pick a weekend choice.
 */

import { GOAL_KEYS } from '@fastlane/content/keys';
import type { Action, DomainEvent, GameState } from '@fastlane/engine';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { feedLine, playerName, slotValues } from '../../game/copy.ts';
import {
  eventsFor,
  type ReportStep,
  reportSteps,
  statTotals,
  type WeekReport,
} from '../../game/report.ts';
import { money, percent, signed, signedMoney } from '../../i18n/format.ts';
import { rowKey } from '../common/hotkeys.ts';
import { PlanChips } from '../common/PlanChips.tsx';
import { STAT_ICON, STAT_TONE, seatOf } from '../common/stats.ts';
import { GoalRings } from '../hud/GoalRings.tsx';

function StatLine({ totals }: { totals: Map<string, number> }) {
  const { t } = useTranslation();
  if (totals.size === 0) return null;
  return (
    <p className="flex flex-wrap gap-1">
      {[...totals].map(([stat, delta]) => (
        <span key={stat} className={`chip ${delta > 0 ? 'chip-good' : 'chip-bad'}`}>
          {signed(delta)}{' '}
          <span aria-hidden="true" className={STAT_TONE[stat as keyof typeof STAT_TONE]}>
            {STAT_ICON[stat as keyof typeof STAT_ICON]}
          </span>
          <span className="sr-only"> {t(`stat.${stat}`)}</span>
        </span>
      ))}
    </p>
  );
}

/** Net-worth effect per reason: money from the world is +, to the world is −; moves between own places are shown as-is. */
function moneyLines(events: readonly DomainEvent[], player: string) {
  const byReason = new Map<string, { amount: number; internal: boolean }>();
  for (const e of eventsFor(events, 'moneyMoved', player)) {
    if (e.cause.kind === 'event') continue;
    const internal = e.from !== 'outside' && e.to !== 'outside';
    const amount = internal ? e.amount : e.from === 'outside' ? e.amount : -e.amount;
    const prev = byReason.get(e.reason) ?? { amount: 0, internal };
    byReason.set(e.reason, { amount: prev.amount + amount, internal });
  }
  return [...byReason].filter(([, v]) => v.amount !== 0);
}

function SummaryPage({ report, state }: { report: WeekReport; state: GameState }) {
  const { t } = useTranslation();
  const { events, player } = report;
  const name = playerName(state, player);
  const lines: string[] = [];
  for (const e of events) {
    if ('player' in e && e.player !== player) continue;
    switch (e.type) {
      case 'turnEnded':
        lines.push(t(`week.ended.${e.reason}`, { name }));
        break;
      case 'restBonus':
        if (e.energy > 0)
          lines.push(
            t('feed.restBonus', { energy: e.energy, time: `${Math.round(e.minutes / 60)}h` }),
          );
        break;
      case 'mealSkipped':
        lines.push(t('week.mealSkipped'));
        break;
      case 'jobChanged':
        lines.push(t(`week.job.${e.change}`, { job: t(`job.${e.job}`) }));
        break;
      case 'rentMissed':
        lines.push(t('week.rentMissed', { owed: money(e.owed), missed: e.missed }));
        break;
      case 'paymentMissed':
        lines.push(t('week.paymentMissed', { debt: t(`debt.${e.debt}`), due: money(e.due) }));
        break;
      case 'collections':
        lines.push(t('week.collections', { debt: t(`debt.${e.debt}`) }));
        break;
      case 'evicted':
        lines.push(t('week.evicted', { home: t(`housing.${e.from}`) }));
        break;
      case 'leaseRenewed':
        lines.push(t('week.leaseRenewed', { from: money(e.from), to: money(e.to) }));
        break;
      case 'gigDeactivated':
        lines.push(t('week.gigBan', { weeks: e.weeks }));
        break;
      case 'credentialEarned':
        lines.push(t('week.credential', { course: t(`course.${e.course}`) }));
        break;
      case 'unsubscribed':
        if (e.reason === 'unpaid')
          lines.push(t('week.unsubscribed', { subscription: t(`subscription.${e.subscription}`) }));
        break;
      case 'questCompleted':
        lines.push(t('week.questCompleted', { quest: t(`quest.${e.quest}`) }));
        break;
      case 'questFailed':
        lines.push(t('week.questFailed', { quest: t(`quest.${e.quest}`) }));
        break;
      case 'questIssued':
        lines.push(t('week.questIssued', { quest: t(`quest.${e.quest}`), deadline: e.deadline }));
        break;
    }
  }
  const money_ = moneyLines(events, player);
  const stats = statTotals(
    events,
    player,
    (e) => e.cause.kind === 'step' || e.cause.kind === 'quest' || e.cause.kind === 'restBonus',
  );
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {lines.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a static list
          <li key={i}>{l}</li>
        ))}
      </ul>
      {money_.length > 0 && (
        <section>
          <h3 className="font-bold">{t('week.money')}</h3>
          <ul className="text-sm">
            {money_.map(([reason, v]) => (
              <li key={reason} className="flex justify-between">
                <span>{t(`reason.${reason}`)}</span>
                <span
                  className={`tabular ${v.internal ? '' : v.amount > 0 ? 'text-teal' : 'text-coral'}`}
                >
                  {v.internal ? money(v.amount) : signedMoney(v.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {stats.size > 0 && (
        <section>
          <h3 className="font-bold">{t('week.statChanges')}</h3>
          <StatLine totals={stats} />
        </section>
      )}
    </div>
  );
}

function EventPage({
  report,
  state,
  onPick,
}: {
  report: WeekReport;
  state: GameState;
  onPick(a: Action): void;
}) {
  const { t } = useTranslation();
  const { events, player } = report;
  const pending = state.pending?.player === player ? state.pending : null;
  const drawn = eventsFor(events, 'weekendEvent', player).at(-1);
  const id = pending?.subject ?? drawn?.event;
  if (!id) return null;
  const resolved = eventsFor(events, 'eventResolved', player).find((e) => e.event === id);
  return (
    <div className="flex flex-col gap-3">
      {drawn && <span className="chip self-start">{t(`category.${drawn.category}`)}</span>}
      <h3 className="font-bold font-display text-xl">{t(`event.${id}`)}</h3>
      <p>{t(`event.${id}.text`)}</p>
      {pending ? (
        <ul className="flex flex-col gap-2" aria-label={t('week.choose')}>
          {pending.options.map((option, i) => {
            const plan = pending.plans[option];
            const key = rowKey(i);
            return (
              <li key={option}>
                <button
                  type="button"
                  className="action-row"
                  aria-keyshortcuts={key}
                  onClick={() =>
                    onPick({ type: 'decide', decisionId: pending.id, optionId: option })
                  }
                >
                  <span className="flex w-full items-center gap-2">
                    {key && <kbd>{key}</kbd>}
                    <span className="flex-1 text-left font-bold">{t(`event.${id}.${option}`)}</span>
                  </span>
                  {plan && <PlanChips plan={plan} />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        resolved && (
          <>
            <p className="font-bold">
              {t('week.yourChoice', { choice: t(`event.${id}.${resolved.choice}`) })}
            </p>
            <StatLine totals={statTotals(events, player, (e) => e.cause.kind === 'event')} />
            {moneyFromEvent(events, player) !== 0 && (
              <p className="tabular">{signedMoney(moneyFromEvent(events, player))}</p>
            )}
          </>
        )
      )}
    </div>
  );
}

function moneyFromEvent(events: readonly DomainEvent[], player: string): number {
  let total = 0;
  for (const e of eventsFor(events, 'moneyMoved', player))
    if (e.cause.kind === 'event')
      total += e.from === 'outside' ? e.amount : e.to === 'outside' ? -e.amount : 0;
  return total;
}

function NewsPage({ report }: { report: WeekReport }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {report.events.map((e, i) => {
        if (e.type === 'newsStarted')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: events are an ordered log
            <article key={i}>
              <span className="chip chip-bad">{t('week.newsStarted')}</span>
              <h3 className="mt-1 font-bold font-display text-lg">{t(`news.${e.news}`)}</h3>
              <p>{t(`news.${e.news}.text`)}</p>
            </article>
          );
        if (e.type === 'newsEnded')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: events are an ordered log
            <p key={i} className="text-fg-muted">
              {t('week.newsEnded', { news: t(`news.${e.news}`) })}
            </p>
          );
        if (e.type === 'marketMoved')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: events are an ordered log
            <p key={i} className="text-sm">
              {t('week.market', {
                regime: t(`regime.${e.regime}`),
                prices: percent(e.priceIndexBp),
                wages: percent(e.wageIndexBp),
              })}
            </p>
          );
        return null;
      })}
    </div>
  );
}

function GoalsPage({ report, state }: { report: WeekReport; state: GameState }) {
  const { t } = useTranslation();
  const standings = eventsFor(report.events, 'standings').at(-1);
  if (!standings) return null;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {state.players.map((p) => {
          const progress = standings.progressBp[p.id];
          const seat = seatOf(state.players, p.id);
          if (!progress) return null;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3">
              <span className="flex w-28 items-center gap-1 font-bold">
                <span style={{ color: seat.colour }} aria-hidden="true">
                  {seat.shape}
                </span>
                <span className="truncate">{p.name}</span>
              </span>
              <GoalRings progress={progress} size={40} />
              <span className="tabular font-bold">{percent(standings.scoresBp[p.id] ?? 0)}</span>
            </li>
          );
        })}
      </ul>
      {eventsFor(report.events, 'nearMiss').map((e) => (
        <p key={`${e.player}-${e.goal}`} className="font-bold text-coral">
          {t('week.nearMiss', {
            name: playerName(state, e.player),
            short: e.goal === 'wealth' ? money(e.short) : e.short,
            goal: t(`goal.${e.goal}`),
          })}
        </p>
      ))}
      <p className="sr-only">{GOAL_KEYS.map((g) => t(`goal.${g}`)).join(', ')}</p>
    </div>
  );
}

function RivalPage({ report, state }: { report: WeekReport; state: GameState }) {
  const { t } = useTranslation();
  const posts = eventsFor(report.events, 'rivalPost');
  const overtakes = eventsFor(report.events, 'overtaken');
  return (
    <div className="flex flex-col gap-3">
      {overtakes.map((e) => (
        <p key={`${e.player}-${e.by}`} className="font-bold font-display text-coral text-lg">
          {t('week.overtaken', { by: playerName(state, e.by), name: playerName(state, e.player) })}
        </p>
      ))}
      {posts.length === 0 && <p className="text-fg-muted">{t('week.noPosts')}</p>}
      {posts.map((e, i) => {
        const seat = seatOf(state.players, e.player);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: posts are an ordered log
          <article key={i} className="rounded-xl border-2 border-ink/20 p-3 dark:border-cream/20">
            <div className="font-bold" style={{ color: seat.colour }}>
              {seat.shape} {playerName(state, e.player)}
            </div>
            <p>{feedLine(state, e.moment, e.params, report.week + i)}</p>
          </article>
        );
      })}
    </div>
  );
}

function TeaserPage({ report, state }: { report: WeekReport; state: GameState }) {
  const { t } = useTranslation();
  const teasers = eventsFor(report.events, 'teaser');
  const humans = new Set(state.players.filter((p) => p.controller === 'human').map((p) => p.id));
  const many = humans.size > 1;
  return (
    <ul className="flex flex-col gap-2">
      {teasers
        .filter((e) => humans.has(e.player))
        .map((e) => (
          <li key={`${e.player}-${e.teaser}`} className="font-display text-lg">
            {many && <span className="font-bold">{playerName(state, e.player)}: </span>}
            {t(`teaser.${e.teaser}`, slotValues(state, e.params))}
          </li>
        ))}
    </ul>
  );
}

export function WeekSequence({
  report,
  state,
  step,
  onNext,
  onPick,
}: {
  report: WeekReport;
  state: GameState;
  step: number;
  onNext(): void;
  onPick(a: Action): void;
}) {
  const { t } = useTranslation();
  const steps = reportSteps(report, state);
  const current: ReportStep = steps[step] ?? 'summary';
  const last = step >= steps.length - 1;
  const blocked = current === 'event' && state.pending !== null;
  const over = state.phase.kind === 'gameOver';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (blocked && state.pending) {
      const i = state.pending.options.findIndex((_, n) => rowKey(n) === e.key);
      const option = state.pending.options[i];
      if (option) {
        e.preventDefault();
        onPick({ type: 'decide', decisionId: state.pending.id, optionId: option });
      }
    }
  };

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <Dialog.Title className="font-bold font-display text-2xl">
              {t(`week.${current}`)}
            </Dialog.Title>
            <span className="text-fg-muted text-sm">
              {t('week.title', { week: report.week })} ·{' '}
              {t('week.step', { n: step + 1, total: steps.length })}
            </span>
          </div>
          <div className="mt-3" aria-live="polite">
            {current === 'summary' && <SummaryPage report={report} state={state} />}
            {current === 'event' && <EventPage report={report} state={state} onPick={onPick} />}
            {current === 'news' && <NewsPage report={report} />}
            {current === 'goals' && <GoalsPage report={report} state={state} />}
            {current === 'rival' && <RivalPage report={report} state={state} />}
            {current === 'teaser' && <TeaserPage report={report} state={state} />}
          </div>
          {!blocked && (
            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              onClick={onNext}
              // biome-ignore lint/a11y/noAutofocus: Enter moves the sequence on
              autoFocus
              key={current}
            >
              {!last
                ? t('week.next')
                : over
                  ? t('week.finish')
                  : t('week.done', { week: state.week })}
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
