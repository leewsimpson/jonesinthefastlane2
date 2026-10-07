/**
 * Run summary (lazy-loaded, NFR-10, ENG-21): who won and why, final scores and goal progress, net worth by week as a
 * hand-made SVG chart, and each human's "2026 in review": a story, best and worst week, and a life timeline. Testers'
 * play-time numbers (ENG-20, ENG-02) sit at the bottom.
 */
import type { GameState, PlayerState } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { Rise } from '../../fx/Reveal.tsx';
import { playerName } from '../../game/copy.ts';
import { content } from '../../game/engine.ts';
import { medianWeekMs, type Pace } from '../../game/pace.ts';
import { type Review, review, type TimelineEntry } from '../../game/review.ts';
import { standingOf } from '../../game/standing.ts';
import { money, percent, signedMoney } from '../../i18n/format.ts';
import { t as tr } from '../../i18n/i18n.ts';
import { seatOf } from '../common/stats.ts';
import { GoalRings } from '../hud/GoalRings.tsx';

function NetWorthChart({ state, marks = [] }: { state: GameState; marks?: number[] }) {
  const W = 320;
  const H = 140;
  const series = state.players.map((p) => ({
    id: p.id,
    points: state.history
      .filter((r) => r.player === p.id)
      .map((r) => [r.week, r.netWorth] as const),
  }));
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return null;
  const maxW = Math.max(...all.map(([w]) => w));
  const minW = Math.min(...all.map(([w]) => w));
  const maxV = Math.max(0, ...all.map(([, v]) => v));
  const minV = Math.min(0, ...all.map(([, v]) => v));
  const x = (w: number) => ((w - minW) / Math.max(1, maxW - minW)) * (W - 8) + 4;
  const y = (v: number) => H - 4 - ((v - minV) / Math.max(1, maxV - minV)) * (H - 8);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`${money(minV)}–${money(maxV)}`}
    >
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-ink/20 dark:stroke-cream/20" />
      {marks.map((w) => (
        <line
          key={w}
          x1={x(w)}
          x2={x(w)}
          y1={0}
          y2={H}
          strokeDasharray="4 4"
          className="stroke-ink/40 dark:stroke-cream/40"
        />
      ))}
      {series.map((s) => (
        <polyline
          key={s.id}
          fill="none"
          strokeWidth={3}
          strokeLinejoin="round"
          stroke={seatOf(state.players, s.id).colour}
          points={s.points.map(([w, v]) => `${x(w)},${y(v)}`).join(' ')}
        />
      ))}
    </svg>
  );
}

const ENTRY_ICON: Record<TimelineEntry['kind'], string> = {
  hired: '💼',
  promoted: '⬆',
  newJob: '🔁',
  lostJob: '📉',
  moved: '🏠',
  credential: '🎓',
  items: '🛍',
  quest: '✅',
};

function entryText(e: TimelineEntry): string {
  switch (e.kind) {
    case 'hired':
    case 'promoted':
    case 'newJob':
    case 'lostJob':
      return tr(`review.${e.kind}`, { job: tr(`job.${e.job}`) });
    case 'moved':
      return tr('review.moved', { home: tr(`housing.${e.home}`) });
    default:
      return tr(`review.${e.kind}`, { count: e.count });
  }
}

/** "1m 05s": play time for testers. */
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

function InReview({ player, r }: { player: PlayerState; r: Review }) {
  const { t } = useTranslation();
  const name = player.name;
  const story = [
    t('review.story.weeks', { name, count: r.weeks }),
    r.jobs > 0 ? t('review.story.jobs', { count: r.jobs }) : t('review.story.noJobs'),
    r.peak && t('review.story.peak', { money: money(r.peak.netWorth), week: r.peak.week }),
    r.moves > 0 && t('review.story.moves', { count: r.moves }),
    r.final && t('review.story.final', { money: money(r.final.netWorth) }),
  ].filter(Boolean);
  return (
    <section className="card flex flex-col gap-3 p-3" aria-labelledby={`review-${player.id}`}>
      <h2 id={`review-${player.id}`} className="font-bold font-display text-xl">
        {t('review.title', { name })}
      </h2>
      <p>{story.join(' ')}</p>
      <div className="flex flex-wrap gap-2">
        {r.best && (
          <span className="chip chip-good py-1 text-sm">
            {t('review.best', { week: r.best.week, delta: signedMoney(r.best.delta) })}
          </span>
        )}
        {r.worst && (
          <span className="chip chip-bad py-1 text-sm">
            {t('review.worst', { week: r.worst.week, delta: signedMoney(r.worst.delta) })}
          </span>
        )}
      </div>
      {r.timeline.length > 0 && (
        <div>
          <h3 className="mb-1 font-bold">{t('review.timeline')}</h3>
          <ol className="flex flex-col gap-1 border-ink/20 border-l-2 pl-3 dark:border-cream/20">
            {r.timeline.map((e, i) => (
              <li key={`${e.week}-${e.kind}`}>
                <Rise index={i}>
                  <span className="tabular mr-2 text-fg-muted text-sm">
                    {t('review.week', { week: e.week })}
                  </span>
                  <span aria-hidden="true">{ENTRY_ICON[e.kind]} </span>
                  {entryText(e)}
                </Rise>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export default function Summary({
  state,
  pace,
  onNewGame,
  onTitle,
}: {
  state: GameState;
  pace?: Pace;
  onNewGame(): void;
  onTitle(): void;
}) {
  const { t } = useTranslation();
  if (state.phase.kind !== 'gameOver') return null;
  const { result } = state.phase;
  const humans = state.players.filter((p) => p.controller === 'human');
  const reviews = humans.map((p) => ({ p, r: review(content, state, p.id) }));
  const ranked = [...state.players].sort(
    (a, b) => (result.scores[b.id] ?? 0) - (result.scores[a.id] ?? 0),
  );
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="font-display font-extrabold text-4xl">{t('summary.title')}</h1>
      <div>
        <p className="font-bold font-display text-2xl text-coral">
          {t('summary.won', { name: playerName(state, result.winner) })}
        </p>
        <p className="text-fg-muted">
          {t(`summary.reason.${result.reason}`, { week: result.week })}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {ranked.map((p) => {
          const seat = seatOf(state.players, p.id);
          return (
            <li key={p.id} className="card flex flex-wrap items-center gap-3 p-3">
              <span className="flex w-28 items-center gap-1 font-bold">
                <span style={{ color: seat.colour }} aria-hidden="true">
                  {seat.shape}
                </span>
                <span className="truncate">{p.name}</span>
              </span>
              <GoalRings progress={standingOf(state, p).progress} size={40} />
              <span className="tabular ml-auto font-bold">
                {t('summary.score')} {percent(result.scores[p.id] ?? 0)}
              </span>
            </li>
          );
        })}
      </ul>
      <section className="card p-3">
        <h2 className="mb-2 font-bold">{t('summary.netWorth')}</h2>
        <NetWorthChart
          state={state}
          marks={reviews
            .flatMap(({ r }) => [r.best?.week, r.worst?.week])
            .filter((w): w is number => w !== undefined)}
        />
      </section>
      {reviews.map(({ p, r }) => (
        <InReview key={p.id} player={p} r={r} />
      ))}
      {pace && humans.length > 0 && (
        <section className="text-fg-muted text-sm" aria-labelledby="tester-heading">
          <h2 id="tester-heading" className="font-bold">
            {t('review.tester')}
          </h2>
          <ul>
            {humans.map((p) => {
              const first = pace.firstPayMs[p.id];
              const median = medianWeekMs(pace, p.id);
              return (
                <li key={p.id} data-testid={`pace-${p.id}`}>
                  {humans.length > 1 && `${p.name}: `}
                  {first === undefined
                    ? t('review.noPay')
                    : t('review.firstPay', { time: clock(first) })}
                  {median !== null && ` · ${t('review.weekPace', { time: clock(median) })}`}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="flex gap-3">
        <button type="button" className="btn flex-1" onClick={onTitle}>
          {t('summary.title2')}
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={onNewGame}
          // biome-ignore lint/a11y/noAutofocus: the main action after a game
          autoFocus
        >
          {t('summary.newGame')}
        </button>
      </div>
    </main>
  );
}
