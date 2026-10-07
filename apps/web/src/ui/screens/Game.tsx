/**
 * The game screen. Layout (NFR-02): portrait stacks HUD, board and action sheet; landscape puts the HUD and the
 * action sheet either side of the board. Keyboard (NFR-03): E ends the week, T travels, D opens details, and the
 * action rows take the number and letter keys shown on them.
 */
import type { Action, Preview } from '@fastlane/engine';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { boardLayout, innerRect } from '../../board/layout.ts';
import { FxLayer } from '../../fx/FxLayer.tsx';
import { coachStep, hasWorked } from '../../game/coach.ts';
import { content, engine } from '../../game/engine.ts';
import { nextHint, pickTrip, weekNeeds } from '../../game/guide.ts';
import { activeHuman } from '../../game/report.ts';
import { useSettings } from '../../settings/settings.ts';
import { useApp } from '../../store/app.ts';
import { gameStore, useGame } from '../../store/game.ts';
import {
  KEY_DETAILS,
  KEY_END_WEEK,
  KEY_TRAVEL,
  QUICK_KEYS,
  rowKey,
  useHotkeys,
} from '../common/hotkeys.ts';
import { Hud } from '../hud/Hud.tsx';
import { ActionSheet, groupActions } from '../panels/ActionSheet.tsx';
import { Coach } from '../panels/Coach.tsx';
import { DetailsDialog } from '../panels/DetailsDialog.tsx';
import { EndWeekDialog, endWeekWarnings } from '../panels/EndWeekDialog.tsx';
import { Ticker } from '../panels/Ticker.tsx';
import { TravelDialog } from '../panels/TravelDialog.tsx';
import { WeekPanel } from '../panels/WeekPanel.tsx';
import { Handoff } from '../week/Handoff.tsx';
import { WeekSequence } from '../week/WeekSequence.tsx';

const Board = lazy(() => import('../../board/Board.tsx'));
const Summary = lazy(() => import('./Summary.tsx'));

/** The week panel needs at least this much open ground in the loop; smaller boards show it in the sheet. */
const PANEL_MIN = { w: 230, h: 250 };
/** Past this the panel stops growing (Tailwind max-w-80). */
const PANEL_MAX = { w: 320, h: 420 };
const MODE_KEY = 'fastlane.travelMode';
const DEFAULT_MODE = 'transit';

/** A per-viewer convenience: storage can be missing or throw (private windows), so the default always works. */
function storedMode(): string {
  try {
    return localStorage.getItem(MODE_KEY) ?? DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** An element's size, for placing the week panel inside the loop. A callback ref, so it follows the element. */
function useSize(): [(el: HTMLElement | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

/** Action kinds per action id, to tell whether a meal or study is on offer where the player stands. */
const KIND = new Map(content.city.actions.map((a) => [a.id, a.kind]));

export function Game() {
  const { t } = useTranslation();
  const go = useApp((s) => s.go);
  const session = useGame((s) => s.session);
  const report = useGame((s) => s.report);
  const reportStep = useGame((s) => s.reportStep);
  const handoff = useGame((s) => s.handoff);
  const lastEvents = useGame((s) => s.lastEvents);
  const error = useGame((s) => s.error);
  const fx = useGame((s) => s.fx);
  const tick = useGame((s) => s.tick);
  const [shakeEl, setShakeEl] = useState<HTMLDivElement | null>(null);
  const tutorial = useSettings((s) => s.tutorial);
  /** Players who skipped or finished the coach this session. */
  const [coached, setCoached] = useState<ReadonlySet<string>>(new Set());
  const [travel, setTravel] = useState<{ dest: string | null } | null>(null);
  const [details, setDetails] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [mode, setModeState] = useState(storedMode);
  const [hover, setHover] = useState<string | null>(null);
  const [boardRef, boardSize] = useSize();

  const state = session?.state;
  const canAct = !!state && state.phase.kind === 'turn' && !state.pending && !report && !handoff;
  const previews: Preview[] = useMemo(
    () => (state && state.phase.kind === 'turn' && !state.pending ? engine.listActions(state) : []),
    [state],
  );
  const groups = useMemo(() => groupActions(previews, rowKey), [previews]);
  const smart = useMemo(
    () => (state && canAct ? engine.smartDefaults(state) : []),
    [state, canAct],
  );

  const dispatch = (a: Action) => {
    const ok = gameStore().getState().dispatch(a);
    if (ok && a.type === 'travel') setTravel(null);
    if (ok && a.type === 'endWeek') setConfirmEnd(false);
  };

  const setMode = (m: string) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // Not remembered this time; the choice still holds for this session.
    }
  };

  const meId = state ? (activeHuman(state) ?? report?.player ?? state.players[0]?.id) : undefined;
  const meNow = state?.players.find((p) => p.id === meId) ?? state?.players[0];
  const needs = useMemo(
    () => (state && meNow ? weekNeeds(content, state, meNow) : null),
    [state, meNow],
  );

  /** One click on the board goes straight there (FR-02), like the original; the dialog only when no mode can. */
  const goTo = (dest: string) => {
    if (!canAct || !meNow || dest === meNow.location) return;
    const trip = pickTrip(previews, dest, mode);
    if (trip) dispatch(trip.action);
    else setTravel({ dest });
  };

  const endWeek = () => {
    if (!canAct || !needs) return;
    const warn = endWeekWarnings(needs);
    if (warn.hungry || warn.rentShort) setConfirmEnd(true);
    else dispatch({ type: 'endWeek' });
  };

  const rowHandlers: Record<string, () => void> = {};
  for (const g of groups)
    for (const r of g.rows)
      if (r.key && r.preview.available) rowHandlers[r.key] = () => dispatch(r.preview.action);
  smart.forEach((d, i) => {
    const key = QUICK_KEYS[i];
    if (key) rowHandlers[key] = () => dispatch(d.preview.action);
  });
  useHotkeys(
    {
      ...rowHandlers,
      [KEY_END_WEEK]: endWeek,
      [KEY_TRAVEL]: () => setTravel({ dest: null }),
      [KEY_DETAILS]: () => setDetails(true),
    },
    canAct && !travel && !details && !confirmEnd,
  );

  if (!session || !state || !needs) return null;

  const quit = () => {
    gameStore().getState().close();
    go({ name: 'title' });
  };

  if (state.phase.kind === 'gameOver' && !report)
    return (
      <Suspense fallback={null}>
        <Summary
          state={state}
          pace={session.pace}
          onTitle={quit}
          onNewGame={() => {
            gameStore().getState().close();
            go({ name: 'setup' });
          }}
        />
      </Suspense>
    );

  const me = meNow;
  if (!me) return null;

  const here = { canEat: false, canStudy: false };
  for (const p of previews)
    if (p.available && p.action.type === 'perform') {
      const kind = KIND.get(p.action.actionId);
      if (kind === 'eat' || kind === 'eat-stored') here.canEat = true;
      if (kind === 'study') here.canStudy = true;
    }
  const hint = nextHint(content, state, me, here);
  const paid = hasWorked(me);
  const coach =
    tutorial && canAct && !coached.has(me.id) ? coachStep(content, state, me, paid) : null;
  const inner = innerRect(
    boardLayout(boardSize.w, boardSize.h, content.city.board.locations.length),
    PANEL_MAX,
  );
  const roomy = inner.w >= PANEL_MIN.w && inner.h >= PANEL_MIN.h;
  const panelProps = {
    state,
    me,
    previews,
    needs,
    hint,
    mode,
    hover,
    canAct,
    onMode: setMode,
    onGo: goTo,
    onEndWeek: endWeek,
  };

  return (
    <div className="game-layout">
      <div className="hud-area min-h-0 overflow-y-auto">
        <Hud state={state} me={me} onDetails={() => setDetails(true)} onQuit={quit} />
        <div className="hidden px-3 py-2 text-fg-muted text-xs wide:block">
          <p>{t('menu.help')}</p>
        </div>
      </div>
      <div ref={boardRef} className="board-area relative min-h-0 overflow-hidden">
        {/* The skyline backdrop (art-direction §9.5), faded so the board reads first; darker at night. */}
        <div
          aria-hidden="true"
          className="board-backdrop pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-center bg-cover opacity-30 dark:opacity-20 dark:brightness-50"
        />
        <div ref={setShakeEl} className="absolute inset-0">
          <Suspense fallback={null}>
            <Board
              state={state}
              active={me.id}
              fx={{ id: tick, coins: fx.coins, moment: fx.moment }}
              onSelect={goTo}
              onHover={setHover}
            />
          </Suspense>
        </div>
        <FxLayer fx={fx} id={tick} shakeTarget={shakeEl} />
        {coach && roomy && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 flex justify-center">
            <Coach
              step={coach}
              canGo={!!coach.location && !!pickTrip(previews, coach.location, mode)}
              onGo={goTo}
              onSkip={() => setCoached(new Set([...coached, me.id]))}
            />
          </div>
        )}
        {roomy && (
          <div
            className="pointer-events-none absolute z-10 flex items-center justify-center"
            style={{ left: inner.x, top: inner.y, width: inner.w, height: inner.h }}
          >
            <div className="pointer-events-auto flex max-h-full w-full max-w-80">
              <WeekPanel {...panelProps} />
            </div>
          </div>
        )}
      </div>
      <ActionSheet
        location={me.location}
        week={state.week}
        housingTier={me.housing.tier}
        world={state.world}
        groups={groups}
        smart={smart}
        canAct={canAct}
        onPick={dispatch}
        onTravel={() => setTravel({ dest: null })}
        onEndWeek={endWeek}
      >
        {coach && !roomy && (
          <Coach
            step={coach}
            compact
            canGo={!!coach.location && !!pickTrip(previews, coach.location, mode)}
            onGo={goTo}
            onSkip={() => setCoached(new Set([...coached, me.id]))}
          />
        )}
        {!roomy && <WeekPanel {...panelProps} compact />}
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
      <EndWeekDialog
        open={confirmEnd}
        needs={needs}
        timeLeft={me.timeLeft}
        onKeep={() => setConfirmEnd(false)}
        onEnd={() => dispatch({ type: 'endWeek' })}
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
