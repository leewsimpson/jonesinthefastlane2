import { lazy, Suspense } from 'react';
import { useApp } from '../store/app.ts';
import { Loading } from './common/Loading.tsx';
import { Title } from './screens/Title.tsx';

const GameRoot = lazy(() => import('./GameRoot.tsx'));

export function App() {
  const screen = useApp((s) => s.screen);
  if (screen.name === 'title') return <Title />;
  return (
    <Suspense fallback={<Loading />}>
      <GameRoot screen={screen} />
    </Suspense>
  );
}
