/**
 * The lazy game chunk's root: binds autosave, loads a slot when needed, and shows setup or the game. The game screen
 * itself switches to the run summary when the game is over.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionRoot } from '../fx/MotionRoot.tsx';
import { saves } from '../persistence/client.ts';
import { type Screen, useApp } from '../store/app.ts';
import { gameStore, setSaver, useGame } from '../store/game.ts';
import { Loading } from './common/Loading.tsx';
import { Game } from './screens/Game.tsx';
import { Setup } from './screens/Setup.tsx';

setSaver((session) => {
  saves.write(session).catch((e: unknown) => console.error('autosave failed', e));
});

export default function GameRoot({
  screen,
}: {
  screen: Exclude<Screen, { name: 'title' } | { name: 'replay' }>;
}) {
  const { t } = useTranslation();
  const go = useApp((s) => s.go);
  const sessionId = useGame((s) => s.session?.id);
  const [error, setError] = useState<string | null>(null);
  const slot = screen.name === 'game' ? screen.slot : null;

  useEffect(() => {
    if (!slot || slot === sessionId) return;
    let cancelled = false;
    saves
      .read(slot)
      .then((session) => {
        if (!cancelled) gameStore().getState().resume(session);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [slot, sessionId]);

  return <MotionRoot>{body()}</MotionRoot>;

  function body() {
    if (screen.name === 'setup') return <Setup />;
    if (error)
      return (
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-6">
          <p role="alert">{t('title.saveBroken', { message: error })}</p>
          <button type="button" className="btn" onClick={() => go({ name: 'title' })}>
            {t('summary.title2')}
          </button>
        </main>
      );
    if (sessionId !== slot) return <Loading />;
    return <Game />;
  }
}
