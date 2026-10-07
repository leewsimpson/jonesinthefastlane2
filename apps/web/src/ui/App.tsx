import { lazy, Suspense } from 'react';
import { useApp } from '../store/app.ts';
import { Loading } from './common/Loading.tsx';
import { Title } from './screens/Title.tsx';

const GameRoot = lazy(() => import('./GameRoot.tsx'));
const Replay = lazy(() => import('./screens/Replay.tsx'));

export function App() {
  const screen = useApp((s) => s.screen);
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
