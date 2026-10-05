/**
 * Phase 2 exit criteria as property tests, on fixture and shipped content (implementation-plan Phase 2):
 *
 * - Money conservation, as agreed: every change to a player's cash, holdings, deposit or debts is a `moneyMoved`
 *   ledger event; flows to or from `outside` carry an external reason (income or spending) and flows between a
 *   player's own places an internal one; internal flows leave net worth exactly unchanged.
 * - No softlock (FR-14): from any reachable state, even one made broke, jobless and banned from GigHub, the player can
 *   earn money within this week or the next.
 */
import { defaultContent, type GameContent } from '@fastlane/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { randomPolicy } from '../ai/random.ts';
import { balanceOf, financialNetWorth, type Place, places } from '../money/ledger.ts';
import type { Action } from '../types/actions.ts';
import { type DomainEvent, EXTERNAL_FLOWS, INTERNAL_FLOWS } from '../types/events.ts';
import type { GameSetup, GameState, PlayerState } from '../types/state.ts';
import { clone } from './clone.ts';
import { createEngine, type Engine } from './reduce.ts';

const setupArb: fc.Arbitrary<GameSetup> = fc.record({
  seed: fc.string(),
  players: fc
    .array(fc.constantFrom('human' as const, 'ai' as const), { minLength: 1, maxLength: 3 })
    .filter((cs) => cs.includes('human'))
    .map((cs) => cs.map((controller) => ({ name: 'P', controller }))),
  config: fc.constant({ weekLimit: 20 }),
});
const choicesArb = fc.array(fc.nat(), { maxLength: 200 });

type Books = Map<string, Map<Place, number>>;

function booksOf(state: GameState): Books {
  return new Map(
    state.players.map((p) => [
      p.id,
      new Map(places(p).map((place) => [place, balanceOf(p, place)])),
    ]),
  );
}

const isDebt = (place: Place) => place.startsWith('debt:');

/** Apply ledger events to the books, checking each flow's reason and that internal flows conserve net worth. */
function post(books: Books, events: DomainEvent[]): void {
  for (const e of events) {
    if (e.type !== 'moneyMoved') continue;
    expect(Number.isInteger(e.amount) && e.amount > 0).toBe(true);
    const external = e.from === 'outside' || e.to === 'outside';
    expect((external ? EXTERNAL_FLOWS : INTERNAL_FLOWS) as readonly string[]).toContain(e.reason);
    const book = books.get(e.player);
    if (!book) throw new Error(`no books for ${e.player}`);
    const move = (place: Place, sign: number) => {
      if (place === 'outside') return;
      book.set(place, (book.get(place) ?? 0) + (isDebt(place) ? -sign : sign) * e.amount);
    };
    move(e.from, -1);
    move(e.to, 1);
  }
}

const netOf = (book: Map<Place, number>) => {
  let total = 0;
  for (const [place, v] of book) total += isDebt(place) ? -v : v;
  return total;
};

function playOut(
  engine: Engine,
  setup: GameSetup,
  choices: number[],
  check: (s: GameState, a: Action, events: DomainEvent[], before: GameState) => void,
) {
  let { state } = engine.newGame(setup);
  for (const choice of choices) {
    if (state.phase.kind === 'gameOver') break;
    const options = engine.listActions(state).filter((o) => o.available);
    const option = options[choice % options.length];
    if (!option) throw new Error('no available action');
    const result = engine.reduce(state, option.action);
    if (!result.ok) throw new Error(`available action refused: ${result.error.code}`);
    check(result.state, option.action, result.events, state);
    state = result.state;
  }
  return state;
}

/** Can the active player earn wages or gig pay within this week or the next, using only free actions? */
function canEarn(engine: Engine, start: GameState): boolean {
  const player = active(start);
  const { city } = engine.content;
  const jobPlaces = new Set([
    ...city.jobs.map((j) => j.location),
    ...city.actions.filter((a) => a.kind === 'apply-job').map((a) => a.location),
  ]);
  // A small, guided search: walk to workplaces, apply, work the shortest shift, gig, or end the week.
  const frontier: GameState[] = [start];
  for (let depth = 0; depth < 12 && frontier.length > 0; depth++) {
    const next: GameState[] = [];
    for (const state of frontier) {
      if (state.phase.kind !== 'turn' || state.pending) continue;
      if (active(state).id !== player.id) {
        // Other humans just end their week, so the search reaches this player's next turn.
        const skipped = engine.reduce(state, { type: 'endWeek' });
        if (skipped.ok) next.push(skipped.state);
        continue;
      }
      for (const option of engine.listActions(state)) {
        if (!option.available) continue;
        const a = option.action;
        const useful =
          a.type === 'endWeek' ||
          (a.type === 'travel' && a.mode === 'walk' && jobPlaces.has(a.to)) ||
          (a.type === 'perform' && isEarnOrApply(engine.content, a.actionId, a.minutes));
        if (!useful) continue;
        const result = engine.reduce(state, a);
        if (!result.ok) continue;
        const earned = result.events.some(
          (e) =>
            e.type === 'moneyMoved' &&
            e.player === player.id &&
            e.from === 'outside' &&
            (e.reason === 'wage' || e.reason === 'gig'),
        );
        if (earned) return true;
        if (result.state.week <= start.week + 1) next.push(result.state);
      }
    }
    frontier.splice(0, frontier.length, ...next.slice(0, 200));
  }
  return false;
}

function isEarnOrApply(content: GameContent, actionId: string, minutes?: number): boolean {
  const def = content.city.actions.find((a) => a.id === actionId);
  if (!def) return false;
  if (def.kind === 'apply-job') return true;
  return (def.kind === 'work-shift' || def.kind === 'gig') && minutes === def.minutes;
}

function active(state: GameState): PlayerState {
  const id = state.phase.kind === 'turn' ? state.phase.player : '';
  const p = state.players.find((q) => q.id === id);
  if (!p) throw new Error('no active player');
  return p;
}

const contents: [string, GameContent][] = [
  ['fixture', fixtureContent],
  ['shipped', defaultContent],
];

for (const [name, content] of contents) {
  // The random AI policy: these properties are about the rules, and the utility scorer would slow the search.
  const engine = createEngine(content, { ai: randomPolicy });

  describe(`economy properties (${name} content)`, () => {
    it('conserves money: every balance change is a ledger flow with a named reason', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, (setup, choices) => {
          playOut(engine, setup, choices, (after, _action, events, before) => {
            const books = booksOf(before);
            const netBefore = new Map([...books].map(([id, b]) => [id, netOf(b)]));
            post(books, events);
            for (const p of after.players) {
              const book = books.get(p.id);
              if (!book) throw new Error('missing books');
              for (const place of places(p))
                expect([p.id, place, book.get(place)]).toEqual([p.id, place, balanceOf(p, place)]);
              // Net worth moves only by external flows.
              let external = 0;
              for (const e of events)
                if (e.type === 'moneyMoved' && e.player === p.id) {
                  if (e.from === 'outside') external += e.amount;
                  if (e.to === 'outside') external -= e.amount;
                }
              expect(financialNetWorth(p) - (netBefore.get(p.id) ?? 0)).toBe(external);
              // Cash only moves through the ledger: its statChanged events match the cash flows.
              const cashDelta = events
                .filter((e) => e.type === 'statChanged' && e.player === p.id && e.stat === 'cash')
                .reduce((sum, e) => sum + (e.type === 'statChanged' ? e.to - e.from : 0), 0);
              const before0 = before.players.find((q) => q.id === p.id);
              expect(cashDelta).toBe(p.stats.cash - (before0?.stats.cash ?? 0));
            }
          });
        }),
        { numRuns: 60 },
      );
    });

    it('never softlocks: a broke, jobless, gig-banned player can still earn (FR-14)', () => {
      fc.assert(
        fc.property(setupArb, choicesArb, fc.boolean(), (setup, choices, wipe) => {
          const reached = playOut(engine, setup, choices, () => {});
          if (reached.phase.kind !== 'turn' || reached.pending) return;
          let state = reached;
          if (wipe) {
            state = clone(reached);
            const p = active(state);
            p.debts.arrears.balance += p.stats.cash;
            p.stats.cash = 0;
            p.job = null;
            p.gigBanWeeks = content.balance.gig.deactivationWeeks;
          }
          expect(canEarn(engine, state)).toBe(true);
        }),
        { numRuns: 40 },
      );
    });
  });
}
