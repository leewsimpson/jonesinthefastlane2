/**
 * Run summary (lazy-loaded, NFR-10): who won and why, final scores and goal progress, and net worth by week as a
 * hand-made SVG chart. The full "2026 in review" comes in Phase 5 (ENG-21).
 */
import type { GameState } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { playerName } from '../../game/copy.ts';
import { standingOf } from '../../game/standing.ts';
import { money, percent } from '../../i18n/format.ts';
import { seatOf } from '../common/stats.ts';
import { GoalRings } from '../hud/GoalRings.tsx';

function NetWorthChart({ state }: { state: GameState }) {
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

export default function Summary({
  state,
  onNewGame,
  onTitle,
}: {
  state: GameState;
  onNewGame(): void;
  onTitle(): void;
}) {
  const { t } = useTranslation();
  if (state.phase.kind !== 'gameOver') return null;
  const { result } = state.phase;
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
        <NetWorthChart state={state} />
      </section>
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
