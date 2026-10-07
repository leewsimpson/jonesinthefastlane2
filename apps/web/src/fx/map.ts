/**
 * Event → presentation mapping (ENG-01, tech-stack §2): the engine reports what happened as domain events, and this
 * decides how it should feel. Pure, so the rules are tested without a renderer. `FxLayer` (DOM) and the board (Pixi)
 * play the result.
 */
import type { DomainEvent, PlayerId } from '@fastlane/engine';

export type PopTone = 'good' | 'bad';

/** A number that floats up from the HUD: cash or a stat. */
export interface Pop {
  key: string;
  /** `cash` or a stat key. */
  stat: string;
  delta: number;
  tone: PopTone;
}

export type Shake = 'none' | 'light' | 'big';

/** A moment worth a banner and confetti, or a sting. */
export type Moment =
  | { kind: 'hired' | 'promoted'; job: string }
  | { kind: 'paid'; amount: number }
  | { kind: 'credential'; course: string }
  | { kind: 'quest'; quest: string }
  | { kind: 'moved'; home: string }
  | { kind: 'laidOff' | 'letGo'; job: string }
  | { kind: 'evicted'; home: string };

export interface Fx {
  pops: Pop[];
  /** Coins to burst from the player's token: 0 for none. */
  coins: number;
  shake: Shake;
  moment: Moment | null;
}

export const NO_FX: Fx = { pops: [], coins: 0, shake: 'none', moment: null };

/** Income reasons that rain coins. */
const EARNED = new Set(['wage', 'gig', 'income', 'interest', 'reward', 'market']);

/** Cents per coin, and the most coins one burst may hold. */
export const CENTS_PER_COIN = 2_000;
export const MAX_COINS = 24;

/**
 * What one batch of events should look like for the player at the screen. `firstPay` marks the first wage of the
 * game (the tutorial's goal, ENG-20), which gets its own moment.
 */
export function fxFor(
  events: readonly DomainEvent[],
  player: PlayerId,
  opts: { firstPay?: boolean } = {},
): Fx {
  const totals = new Map<string, number>();
  let earned = 0;
  let wage = 0;
  let moment: Moment | null = null;
  let shake: Shake = 'none';
  const raise = (s: Shake) => {
    if (s === 'big' || (s === 'light' && shake === 'none')) shake = s;
  };

  for (const e of events) {
    if (!('player' in e) || e.player !== player) continue;
    switch (e.type) {
      case 'statChanged':
        totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.to - e.from);
        break;
      case 'moneyMoved':
        if (e.from === 'outside' && EARNED.has(e.reason)) earned += e.amount;
        if (e.from === 'outside' && e.reason === 'wage') wage += e.amount;
        break;
      case 'jobChanged':
        if (e.change === 'hired' || e.change === 'promoted') {
          moment = { kind: e.change, job: e.job };
          raise(e.change === 'promoted' ? 'big' : 'light');
        } else if (e.change === 'laidOff' || e.change === 'letGo') {
          moment = { kind: e.change, job: e.job };
          raise('big');
        }
        break;
      case 'credentialEarned':
        moment = { kind: 'credential', course: e.course };
        raise('light');
        break;
      case 'questCompleted':
        moment ??= { kind: 'quest', quest: e.quest };
        raise('light');
        break;
      case 'moved':
        moment ??= { kind: 'moved', home: e.to };
        break;
      case 'evicted':
        moment = { kind: 'evicted', home: e.from };
        raise('big');
        break;
    }
  }

  if (opts.firstPay && wage > 0 && !moment) {
    moment = { kind: 'paid', amount: wage };
    raise('light');
  }

  const pops: Pop[] = [];
  const cash = totals.get('cash');
  if (cash) pops.push({ key: 'cash', stat: 'cash', delta: cash, tone: cash > 0 ? 'good' : 'bad' });
  for (const [stat, delta] of totals)
    if (stat !== 'cash' && delta !== 0)
      pops.push({ key: stat, stat, delta, tone: delta > 0 ? 'good' : 'bad' });

  const coins =
    earned > 0 ? Math.min(MAX_COINS, Math.max(3, Math.round(earned / CENTS_PER_COIN))) : 0;
  return { pops, coins, shake, moment };
}

/** Whether a batch holds the player's first wage of the game: none in the state before it. */
export function isFirstWage(events: readonly DomainEvent[], player: PlayerId, paidBefore: boolean) {
  return (
    !paidBefore &&
    events.some(
      (e) =>
        e.type === 'moneyMoved' &&
        e.player === player &&
        e.from === 'outside' &&
        e.reason === 'wage',
    )
  );
}
