/**
 * The game screen. Layout (NFR-02): portrait stacks HUD, board and action sheet; landscape puts the HUD and the
 * action sheet either side of the board. Keyboard (NFR-03): E ends the week, T travels, D opens details, and the
 * action rows take the number and letter keys shown on them.
 */
import type { Action, Preview } from '@fastlane/engine';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { engine } from '../../game/engine.ts';
import { activeHuman } from '../../game/report.ts';
import { useApp } from '../../store/app.ts';
import { gameStore, useGame } from '../../store/game.ts';
import { KEY_DETAILS, KEY_END_WEEK, KEY_TRAVEL, rowKey, useHotkeys } from '../common/hotkeys.ts';
import { Hud } from '../hud/Hud.tsx';
import { ActionSheet, groupActions } from '../panels/ActionSheet.tsx';
import { DetailsDialog } from '../panels/DetailsDialog.tsx';
import { Ticker } from '../panels/Ticker.tsx';
import { TravelDialog } from '../panels/TravelDialog.tsx';
import { Handoff } from '../week/Handoff.tsx';
import { WeekSequence } from '../week/WeekSequence.tsx';

const Board = lazy(() => import('../../board/Board.tsx'));
const Summary = lazy(() => import('./Summary.tsx'));

export function Game() {
  const { t } = useTranslation();
  const go = useApp((s) => s.go);
  const session = useGame((s) => s.session);
  const report = useGame((s) => s.report);
  const reportStep = useGame((s) => s.reportStep);
  const handoff = useGame((s) => s.handoff);
  const lastEvents = useGame((s) => s.lastEvents);
  const error = useGame((s) => s.error);
  const [travel, setTravel] = useState<{ dest: string | null } | null>(null);
  const [details, setDetails] = useState(false);

  const state = session?.state;
  const canAct = !!state && state.phase.kind === 'turn' && !state.pending && !report && !handoff;
  const previews: Preview[] = useMemo(
    () => (state && state.phase.kind === 'turn' && !state.pending ? engine.listActions(state) : []),
    [state],
  );
  const groups = useMemo(() => groupActions(previews, rowKey), [previews]);

  const dispatch = (a: Action) => {
    const ok = gameStore().getState().dispatch(a);
    if (ok && a.type === 'travel') setTravel(null);
  };

  const rowHandlers: Record<string, () => void> = {};
  for (const g of groups)
    for (const r of g.rows)
      if (r.key && r.preview.available) rowHandlers[r.key] = () => dispatch(r.preview.action);
  useHotkeys(
    {
      ...rowHandlers,
      [KEY_END_WEEK]: () => dispatch({ type: 'endWeek' }),
      [KEY_TRAVEL]: () => setTravel({ dest: null }),
      [KEY_DETAILS]: () => setDetails(true),
    },
    canAct && !travel && !details,
  );

  if (!session || !state) return null;

  const quit = () => {
    gameStore().getState().close();
    go({ name: 'title' });
  };

  if (state.phase.kind === 'gameOver' && !report)
    return (
      <Suspense fallback={null}>
        <Summary
          state={state}
          onTitle={quit}
          onNewGame={() => {
            gameStore().getState().close();
            go({ name: 'setup' });
          }}
        />
      </Suspense>
    );

  const active = activeHuman(state) ?? report?.player ?? state.players[0]?.id ?? 'p1';
  const me = state.players.find((p) => p.id === active) ?? state.players[0];
  if (!me) return null;

  return (
    <div className="game-layout">
      <div className="hud-area min-h-0 overflow-y-auto">
        <Hud state={state} me={me} onDetails={() => setDetails(true)} onQuit={quit} />
        <div className="hidden px-3 py-2 text-fg-muted text-xs wide:block">
          <p>{t('menu.help')}</p>
        </div>
      </div>
      <div className="board-area relative min-h-0">
        <Suspense fallback={null}>
          <Board
            state={state}
            active={me.id}
            onSelect={(id) => {
              if (canAct && id !== me.location) setTravel({ dest: id });
            }}
          />
        </Suspense>
      </div>
      <ActionSheet
        location={me.location}
        world={state.world}
        groups={groups}
        canAct={canAct}
        onPick={dispatch}
        onTravel={() => setTravel({ dest: null })}
        onEndWeek={() => dispatch({ type: 'endWeek' })}
      >
        <Ticker events={lastEvents} state={state} player={me.id} error={error} />
      </ActionSheet>

      <TravelDialog
        open={travel !== null}
        from={me.location}
        initial={travel?.dest ?? null}
        previews={previews}
        onClose={() => setTravel(null)}
        onPick={dispatch}
      />
      <DetailsDialog open={details} state={state} me={me} onClose={() => setDetails(false)} />
      {report && (
        <WeekSequence
          report={report}
          state={state}
          step={reportStep}
          onNext={() => gameStore().getState().nextStep()}
          onPick={dispatch}
        />
      )}
      {handoff && !report && (
        <Handoff
          players={state.players}
          player={handoff}
          name={state.players.find((p) => p.id === handoff)?.name ?? handoff}
          onStart={() => gameStore().getState().takeHandoff()}
        />
      )}
    </div>
  );
}
