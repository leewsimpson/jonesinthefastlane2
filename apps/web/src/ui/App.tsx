import { lazy, Suspense, useEffect } from 'react';
import { useApp } from '../store/app.ts';
import { Loading } from './common/Loading.tsx';
import { Title } from './screens/Title.tsx';

const GameRoot = lazy(() => import('./GameRoot.tsx'));
const Replay = lazy(() => import('./screens/Replay.tsx'));

export function App() {
  const screen = useApp((s) => s.screen);
  // Screens are pages that scroll on phones: each new one starts at its top, not where the last one was left.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);
  if (screen.name === 'title') return <Title />;
  if (screen.name === 'replay')
    return (
      <Suspense fallback={<Loading />}>
        <Replay />
      </Suspense>
    );
  return (
    <Suspense fallback={<Loading />}>
      <GameRoot screen={screen} />
    </Suspense>
  );
}
