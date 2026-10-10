/** Detail on tap (FR-20): every stat, the job, home, money, education, items, quests, news and goal values. */

import { GOAL_KEYS, STAT_KEYS } from '@fastlane/content/keys';
import { balanceOf, type GameState, netWorth, type PlayerState, places } from '@fastlane/engine';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { placeLabel } from '../../game/copy.ts';
import { content } from '../../game/engine.ts';
import { standingOf } from '../../game/standing.ts';
import { duration, money, percent } from '../../i18n/format.ts';
import { ItemArt } from '../common/AtlasArt.tsx';
import { WeeklyChips } from '../common/PlanChips.tsx';
import { STAT_ICON, STAT_TONE } from '../common/stats.ts';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 font-bold font-display">{title}</h3>
      {children}
    </section>
  );
}

export function DetailsDialog({
  open,
  state,
  me,
  onClose,
}: {
  open: boolean;
  state: GameState;
  me: PlayerState;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const none = <p className="text-fg-muted">{t('details.none')}</p>;
  const course = me.enrollment
    ? content.city.courses.find((c) => c.id === me.enrollment?.course)
    : undefined;
  const standing = standingOf(state, me);
  const home = content.city.housing.find((h) => h.id === me.housing.tier);
  const wardrobe = content.balance.wardrobeTiers[me.stats.wardrobe] ?? 'casual';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="font-bold font-display text-2xl">
            {t('details.title', { name: me.name })}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {t('details.title', { name: me.name })}
          </Dialog.Description>

          <Section title={t('details.goals')}>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {GOAL_KEYS.map((g) => (
                <li key={g}>
                  <span className="font-bold">{t(`goal.${g}`)}</span>{' '}
                  {percent(standing.progress[g])}
                  <span className="block text-fg-muted">
                    {t('details.goalLine', {
                      value: g === 'wealth' ? money(standing.values[g]) : standing.values[g],
                      target: g === 'wealth' ? money(state.config.goals[g]) : state.config.goals[g],
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t('details.stats')}>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {STAT_KEYS.map((s) => (
                <li key={s}>
                  <span aria-hidden="true" className={STAT_TONE[s]}>
                    {STAT_ICON[s]}
                  </span>{' '}
                  {t(`stat.${s}`)}:{' '}
                  <span className="tabular font-bold">
                    {s === 'cash'
                      ? money(me.stats.cash)
                      : s === 'wardrobe'
                        ? t(`wardrobe.${wardrobe}`)
                        : me.stats[s]}
                  </span>
                </li>
              ))}
              <li>
                {STAT_ICON.time} {t('stat.time')}:{' '}
                <span className="font-bold">{duration(me.timeLeft)}</span>
              </li>
              <li>
                {STAT_ICON.meals} {t('stat.meals')}:{' '}
                <span className="font-bold">{me.mealsThisWeek}</span>
              </li>
            </ul>
          </Section>

          <Section title={t('details.job')}>
            {me.job ? (
              <p className="text-sm">
                {t('details.jobLine', {
                  job: t(`job.${me.job.id}`),
                  rating: me.job.rating,
                  hours: duration(me.job.minutesThisWeek),
                })}
                {me.job.layoffWarning && (
                  <span className="ml-2 font-bold text-bad">{t('details.layoffWarning')}</span>
                )}
              </p>
            ) : (
              <p className="text-fg-muted text-sm">{t('details.noJob')}</p>
            )}
          </Section>

          <Section title={t('details.home')}>
            <p className="text-sm">
              {t('details.homeLine', {
                home: t(`housing.${me.housing.tier}`),
                rent: money(me.housing.rent),
                weeks: me.housing.leaseWeeksLeft,
              })}
            </p>
            {home && <WeeklyChips effects={home.weekly} />}
          </Section>

          <Section title={t('details.money')}>
            <ul className="text-sm">
              {places(me)
                .filter((p) => p !== 'outside' && balanceOf(me, p) !== 0)
                .map((p) => (
                  <li key={p} className="flex justify-between">
                    <span>{placeLabel(p)}</span>
                    <span className="tabular">
                      {p.startsWith('debt:') ? '−' : ''}
                      {money(balanceOf(me, p))}
                    </span>
                  </li>
                ))}
              <li className="flex justify-between border-ink/20 border-t font-bold">
                <span>{t('details.netWorth')}</span>
                <span className="tabular">{money(netWorth(content, me))}</span>
              </li>
            </ul>
          </Section>

          <Section title={t('details.education')}>
            {course && me.enrollment ? (
              <p className="text-sm">
                {t('details.enrolled', {
                  course: t(`course.${course.id}`),
                  done: duration(me.enrollment.minutes),
                  needed: duration(course.studyMinutes),
                })}
              </p>
            ) : null}
            <p className="text-sm">
              <span className="font-bold">{t('details.credentials')}: </span>
              {me.credentials.length
                ? me.credentials.map((c) => t(`course.${c}`)).join(', ')
                : t('details.none')}
            </p>
          </Section>

          <Section title={t('details.items')}>
            {me.items.length ? (
              <ul className="flex flex-wrap gap-2 text-sm">
                {me.items.map((i) => (
                  <li key={i} className="chip gap-1 py-1">
                    <ItemArt id={i} size={28} />
                    {t(`item.${i}`)}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </Section>

          <Section title={t('details.subscriptions')}>
            {me.subscriptions.length ? (
              <p className="text-sm">
                {me.subscriptions.map((s) => t(`subscription.${s}`)).join(', ')}
              </p>
            ) : (
              none
            )}
          </Section>

          <Section title={t('details.quests')}>
            {me.quests.length ? (
              <ul className="text-sm">
                {me.quests.map((q) => (
                  <li key={q.id}>
                    {t('details.questLine', { quest: t(`quest.${q.id}`), deadline: q.deadline })}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </Section>

          <Section title={t('details.news')}>
            {state.world.news.length ? (
              <ul className="text-sm">
                {state.world.news.map((n) => (
                  <li key={n.id}>
                    <span className="font-bold">{t(`news.${n.id}`)}</span>
                    <span className="block text-fg-muted">{t(`news.${n.id}.text`)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </Section>

          <Dialog.Close className="btn mt-4 w-full">{t('details.close')}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
