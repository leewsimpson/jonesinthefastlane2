/**
 * Debug replay route, `#/replay` (simulator §4): load `{ setup, log }` from `pnpm sim trace --replay` (or a save
 * file) and step through the game on the real board and HUD, so a strange sim game can be watched. Read-only: it
 * never touches the game store or save slots. Lazy-loaded; nothing links to it from the title screen.
 */
import type { Action, GameSetup, GameState } from '@fastlane/engine';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionRoot } from '../../fx/MotionRoot.tsx';
import { engine } from '../../game/engine.ts';
import { type ReplaySteps, replaySteps, stepOfWeek, viewer } from '../../game/replay.ts';
import { ReplayFileSchema } from '../../persistence/schema.ts';
import { useApp } from '../../store/app.ts';
import { Hud } from '../hud/Hud.tsx';

const Board = lazy(() => import('../../board/Board.tsx'));

/** Milliseconds between steps while playing. */
const PLAY_MS = 400;

export default function Replay() {
  const { t } = useTranslation();
  const go = useApp((s) => s.go);
  const [steps, setSteps] = useState<ReplaySteps | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);

  const last = steps ? steps.states.length - 1 : 0;
  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setAt((i) => Math.min(last, i + 1)), PLAY_MS);
    return () => window.clearTimeout(id);
  }, [playing, at, last]);

  const load = (text: string) => {
    try {
      const parsed = ReplayFileSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error(t('replay.badFile'));
      const built = replaySteps(
        engine,
        parsed.data.setup as GameSetup,
        parsed.data.log as Action[],
      );
      setSteps(built);
      setAt(0);
      setProblem(
        built.error
          ? t('replay.stopped', { index: built.error.index + 1, code: built.error.code })
          : null,
      );
    } catch (e) {
      setSteps(null);
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  const state: GameState | undefined = steps?.states[at];
  const me = useMemo(
    () => (state ? state.players.find((p) => p.id === viewer(state)) : undefined),
    [state],
  );

  if (!steps || !state || !me)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
        <h1 className="font-display text-3xl font-extrabold">{t('replay.title')}</h1>
        <p className="text-fg-muted">{t('replay.intro')}</p>
        <label className="flex flex-col gap-2">
          <span>{t('replay.file')}</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(load);
            }}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span>{t('replay.paste')}</span>
          <textarea
            className="min-h-32 rounded-md border-2 border-cream/20 bg-surface p-2 font-mono text-xs"
            onChange={(e) => e.target.value.trim() && load(e.target.value)}
          />
        </label>
        {problem && <p role="alert">{problem}</p>}
        <button type="button" className="btn self-start" onClick={() => go({ name: 'title' })}>
          {t('summary.title2')}
        </button>
      </main>
    );

  const action = at > 0 ? steps.log[at - 1] : undefined;
  return (
    <MotionRoot>
      <main className="flex h-dvh flex-col">
        <div className="min-h-0 shrink-0">
          <Hud state={state} me={me} onDetails={() => {}} onQuit={() => go({ name: 'title' })} />
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={null}>
            <Board state={state} active={me.id} onSelect={() => {}} />
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t-2 border-cream/20 bg-surface p-3">
          <button type="button" className="btn" onClick={() => setAt(Math.max(0, at - 1))}>
            {t('replay.back')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setPlaying(!playing)}>
            {playing ? t('replay.pause') : t('replay.play')}
          </button>
          <button type="button" className="btn" onClick={() => setAt(Math.min(last, at + 1))}>
            {t('replay.next')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setAt(stepOfWeek(steps, state.week + 1))}
          >
            {t('replay.nextWeek')}
          </button>
          <input
            type="range"
            min={0}
            max={last}
            value={at}
            aria-label={t('replay.step')}
            className="min-w-40 flex-1"
            onChange={(e) => setAt(Number(e.target.value))}
          />
          <span className="text-fg-muted text-sm" aria-live="polite">
            {t('replay.where', { step: at, steps: last, week: state.week, player: me.name })}
            {action && ` · ${describe(action, t)}`}
          </span>
          {problem && (
            <span role="alert" className="text-bad text-sm">
              {problem}
            </span>
          )}
        </div>
      </main>
    </MotionRoot>
  );
}

function describe(action: Action, t: (key: string) => string): string {
  switch (action.type) {
    case 'travel':
      return `→ ${t(`location.${action.to}`)}`;
    case 'perform':
      return t(`action.${action.actionId}`) + (action.minutes ? ` (${action.minutes / 60}h)` : '');
    case 'endWeek':
      return t('replay.endWeek');
    case 'decide':
      return `✓ ${action.optionId}`;
  }
}
