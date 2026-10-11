/**
 * The game screen. Two layouts (NFR-02, art-direction §4), each filling the screen with no page scroll: mobile is a
 * status bar over the board and the location panel (side by side in landscape); desktop puts the board on the left,
 * the location panel on the right and the dashboard along the foot. The panel is the same in both: the action sheet
 * scrolls, with Travel / End week pinned under it. Keyboard (NFR-03): E ends the week, T travels, D opens details,
 * and the action rows take the number and letter keys shown on them.
 */
import type { Action, Preview } from '@fastlane/engine';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startMusic } from '../../audio/audio.ts';
import { boardLayout, feedbackPoint } from '../../board/layout.ts';
import { FxLayer } from '../../fx/FxLayer.tsx';
import { coachStep, hasWorked } from '../../game/coach.ts';
import { content, engine } from '../../game/engine.ts';
import { defaultMode, nextHint, pickTrip, weekNeeds } from '../../game/guide.ts';
import { activeHuman } from '../../game/report.ts';
import { duration } from '../../i18n/format.ts';
import { useWideLayout } from '../../settings/hooks.ts';
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
import { seatOf } from '../common/stats.ts';
import { Hud, HudToolbar, WeekSign } from '../hud/Hud.tsx';
import { ActionDock, ActionSheet, groupActions } from '../panels/ActionSheet.tsx';
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

const MODE_KEY = 'fastlane.travelMode';
const DEFAULT_MODE = defaultMode(content);

/** A per-viewer convenience: storage can be missing or throw (private windows), so the default always works. */
function storedMode(): string {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return content.city.board.transportModes.some((m) => m.id === stored) && stored
      ? stored
      : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** An element's size, for placing feedback over the board. A callback ref, so it follows the element. */
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
  const wide = useWideLayout();
  useEffect(startMusic, []);

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
    <div className={`game-layout ${wide ? 'game-desktop' : 'game-mobile'}`}>
      <div className="hud-area">
        <Hud state={state} me={me} wide={wide} onDetails={() => setDetails(true)} />
      </div>
      <div ref={boardRef} className="board-area relative min-h-0 overflow-hidden">
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
        <FxLayer
          fx={fx}
          id={tick}
          shakeTarget={shakeEl}
          anchor={feedbackPoint(
            boardLayout(boardSize.w, boardSize.h, content.city.board.locations.length),
            Math.max(
              0,
              content.city.board.locations.findIndex((l) => l.id === me.location),
            ),
          )}
        />
        {wide && (
          <div className="absolute top-2 left-2 z-10">
            <WeekSign state={state} me={me} />
          </div>
        )}
        {wide && (
          <HudToolbar
            onDetails={() => setDetails(true)}
            onQuit={quit}
            className="absolute top-2 right-2 z-10 [&>*]:flex-none"
          />
        )}
      </div>
      <div className="panel">
        <ActionSheet
          location={me.location}
          week={state.week}
          housingTier={me.housing.tier}
          avatar={seatOf(state.players, me.id).avatar}
          world={state.world}
          groups={groups}
          smart={smart}
          studyNote={(() => {
            const course = content.city.courses.find((c) => c.id === me.enrollment?.course);
            return course && me.enrollment
              ? t('quick.studyProgress', {
                  course: t(`course.${course.id}`),
                  done: duration(me.enrollment.minutes),
                  needed: duration(course.studyMinutes),
                })
              : undefined;
          })()}
          canAct={canAct}
          onPick={dispatch}
          footer={
            wide ? (
              <p className="px-4 pb-3 text-fg-muted text-xs">{t('menu.help')}</p>
            ) : (
              <HudToolbar onDetails={() => setDetails(true)} onQuit={quit} className="px-4 pb-4" />
            )
          }
        >
          {coach && (
            <Coach
              step={coach}
              compact
              canGo={!!coach.location && !!pickTrip(previews, coach.location, mode)}
              onGo={goTo}
              onSkip={() => setCoached(new Set([...coached, me.id]))}
            />
          )}
          <WeekPanel {...panelProps} compact />
        </ActionSheet>
        <ActionDock canAct={canAct} onTravel={() => setTravel({ dest: null })} onEndWeek={endWeek}>
          <Ticker events={lastEvents} state={state} player={me.id} error={error} />
        </ActionDock>
      </div>

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
