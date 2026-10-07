/**
 * The game store (tech-stack §2): Zustand wrapped around the pure engine. `dispatch` is the only way the UI changes
 * the game. It runs `engine.reduce`, keeps the action log for saves, and routes the domain events: events from inside
 * a turn feed the action ticker, and everything from a turn's end onwards goes to the end-of-week report.
 */
import type {
  Action,
  DomainEvent,
  GameSetup,
  GameState,
  PlayerId,
  RuleError,
} from '@fastlane/engine';
import { createStore, useStore } from 'zustand';
import { type Fx, fxFor, isFirstWage, NO_FX } from '../fx/map.ts';
import { engine } from '../game/engine.ts';
import {
  markTurnStart,
  newPace,
  type Pace,
  recordFirstPay,
  recordTurnEnd,
  tick as tickPace,
} from '../game/pace.ts';
import {
  activeHuman,
  humanCount,
  reportSteps,
  turnEndIndex,
  type WeekReport,
} from '../game/report.ts';

export interface Session {
  /** Save slot id. */
  id: string;
  setup: GameSetup;
  /** Human actions only, in order (engine-design §14). */
  log: Action[];
  state: GameState;
  /** Play-time instrumentation (ENG-20, ENG-02); saved alongside, never part of the engine state. */
  pace: Pace;
}

export interface GameStoreState {
  session: Session | null;
  /** Events from the last action inside a turn, for the ticker. */
  lastEvents: DomainEvent[];
  /** Bumped on every accepted action, so the ticker can tell two identical batches apart. */
  tick: number;
  /** How the last in-turn batch should feel (ENG-01); played by the FX layer and the board. */
  fx: Fx;
  report: WeekReport | null;
  reportStep: number;
  /** Hotseat (FR-06): the human who must take the device before their turn shows. */
  handoff: PlayerId | null;
  error: RuleError | null;

  start(id: string, setup: GameSetup): void;
  resume(session: Omit<Session, 'pace'> & { pace?: Pace }): void;
  dispatch(action: Action): boolean;
  /** Next page of the week report; closing the last page moves on to the next turn. */
  nextStep(): void;
  takeHandoff(): void;
  clearError(): void;
  close(): void;
}

export type Saver = (session: Session) => void;

/** Builds a store. `save` is called after every accepted action and at week end (NFR-13). */
export function createGameStore(save: Saver = () => {}, now: () => number = () => Date.now()) {
  return createStore<GameStoreState>()((set, get) => {
    const handoffFor = (state: GameState): PlayerId | null => {
      const next = activeHuman(state);
      return next && humanCount(state) > 1 ? next : null;
    };

    return {
      session: null,
      lastEvents: [],
      tick: 0,
      fx: NO_FX,
      report: null,
      reportStep: 0,
      handoff: null,
      error: null,

      start(id, setup) {
        const { state, events } = engine.newGame(setup);
        const session: Session = { id, setup, log: [], state, pace: tickPace(newPace(), now()) };
        set({
          session,
          lastEvents: events,
          fx: NO_FX,
          report: null,
          reportStep: 0,
          handoff: handoffFor(state),
          error: null,
        });
        save(session);
      },

      resume(loaded) {
        const session: Session = { ...loaded, pace: loaded.pace ?? newPace() };
        const { pending, week } = session.state;
        set({
          session,
          lastEvents: [],
          fx: NO_FX,
          // Saved mid-sequence with a weekend choice open: reopen the sequence at the card.
          report: pending ? { player: pending.player, week, events: [] } : null,
          reportStep: 0,
          handoff: handoffFor(session.state),
          error: null,
        });
      },

      dispatch(action) {
        const { session, report } = get();
        if (!session) return false;
        const before = session.state;
        const player = activeHuman(before);
        const result = engine.reduce(before, action);
        if (!result.ok) {
          set({ error: result.error });
          return false;
        }
        const { events } = result;
        let pace = tickPace(session.pace, now());
        const end = report || player === null ? -1 : turnEndIndex(events, player);
        const inTurn = end < 0 ? events : events.slice(0, end);
        let fx = NO_FX;
        if (!report && player !== null) {
          const firstPay = isFirstWage(
            inTurn,
            player,
            session.pace.firstPayMs[player] !== undefined,
          );
          if (firstPay) pace = recordFirstPay(pace, player);
          fx = fxFor(inTurn, player, { firstPay });
          if (end >= 0) pace = recordTurnEnd(pace, player, before.week);
        }
        const next: Session = {
          ...session,
          log: [...session.log, action],
          state: result.state,
          pace,
        };
        if (report) {
          set({
            session: next,
            report: { ...report, events: [...report.events, ...events] },
            error: null,
          });
        } else {
          set({
            session: next,
            lastEvents: inTurn,
            fx,
            tick: get().tick + 1,
            report:
              end < 0 || player === null
                ? null
                : { player, week: before.week, events: events.slice(end) },
            reportStep: 0,
            error: null,
          });
        }
        save(next);
        return true;
      },

      nextStep() {
        const { report, reportStep, session } = get();
        if (!report || !session) return;
        const steps = reportSteps(report, session.state);
        const step = steps[reportStep];
        // A weekend choice has to be made before the sequence can move past the card.
        if (step === 'event' && session.state.pending) return;
        if (reportStep + 1 < steps.length) {
          set({ reportStep: reportStep + 1 });
          return;
        }
        const next = { ...session, pace: markTurnStart(tickPace(session.pace, now())) };
        set({
          session: next,
          report: null,
          reportStep: 0,
          lastEvents: [],
          fx: NO_FX,
          handoff: handoffFor(session.state),
        });
        save(next);
      },

      takeHandoff() {
        const { session } = get();
        // The next human's week starts when they take the device.
        set({
          handoff: null,
          session: session && {
            ...session,
            pace: markTurnStart({ ...session.pace, lastAt: now() }),
          },
        });
      },

      clearError() {
        set({ error: null });
      },

      close() {
        set({
          session: null,
          report: null,
          reportStep: 0,
          handoff: null,
          lastEvents: [],
          fx: NO_FX,
        });
      },
    };
  });
}

export type GameStore = ReturnType<typeof createGameStore>;

let current: GameStore | null = null;

/** The app's one game store. `setSaver` must run first so autosave is wired in before any game starts. */
export function gameStore(): GameStore {
  current ??= createGameStore((s) => saver(s));
  return current;
}

let saver: Saver = () => {};
export function setSaver(fn: Saver): void {
  saver = fn;
}

export function useGame<T>(selector: (s: GameStoreState) => T): T {
  return useStore(gameStore(), selector);
}
