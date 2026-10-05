/**
 * The ledger (engine-design §10.1): the one write path for money. Every change to cash, a holding, the lease deposit
 * or a debt is a `transfer` between two places, tagged with a reason. `outside` is the rest of the world: flows to
 * or from it are income and spending; flows between a player's own places (saving, borrowing, repaying) leave their
 * net worth unchanged. The money-conservation property test checks the books against these events.
 */
import { DEBT_KINDS, type DebtKind } from '@fastlane/content/keys';
import type { Emitter } from '../core/context.ts';
import type { Cause, FlowReason } from '../types/events.ts';
import type { PlayerState } from '../types/state.ts';

/** Somewhere a player's money can be. `hold:<id>` is savings or a market asset; `debt:<kind>` is owed. */
export type Place = 'cash' | 'deposit' | 'outside' | `hold:${string}` | `debt:${DebtKind}`;

const isDebt = (place: Place): place is `debt:${DebtKind}` => place.startsWith('debt:');

/** The balance at a place, in cents. Debts are positive amounts owed. */
export function balanceOf(player: Readonly<PlayerState>, place: Place): number {
  if (place === 'cash') return player.stats.cash;
  if (place === 'deposit') return player.housing.deposit;
  if (place === 'outside') throw new Error('outside has no balance');
  if (isDebt(place)) return player.debts[place.slice(5) as DebtKind].balance;
  const held = player.holdings[place.slice(5)];
  if (held === undefined) throw new Error(`unknown holding ${place}`);
  return held;
}

function setBalance(ctx: Emitter, player: PlayerState, place: Place, to: number, cause: Cause) {
  if (to < 0) throw new Error(`${place} would go negative for ${player.id}`);
  if (place === 'cash') {
    const from = player.stats.cash;
    player.stats.cash = to;
    ctx.emit({ type: 'statChanged', player: player.id, stat: 'cash', from, to, cause });
  } else if (place === 'deposit') player.housing.deposit = to;
  else if (isDebt(place)) player.debts[place.slice(5) as DebtKind].balance = to;
  else player.holdings[place.slice(5)] = to;
}

/**
 * Move `amount` cents from one place to another. An asset place (cash, deposit, holdings) giving money goes down; a
 * debt place "giving" money means more is owed. Receiving is the reverse. Throws if any balance would go negative:
 * that is an engine bug, never a player's mistake (engine-design §10).
 */
export function transfer(
  ctx: Emitter,
  player: PlayerState,
  from: Place,
  to: Place,
  amount: number,
  reason: FlowReason,
  cause: Cause,
): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`bad transfer amount ${amount}`);
  if (amount === 0) return;
  if (from === to) throw new Error(`transfer from ${from} to itself`);
  ctx.emit({ type: 'moneyMoved', player: player.id, from, to, amount, reason, cause });
  if (from !== 'outside') {
    const sign = isDebt(from) ? 1 : -1;
    setBalance(ctx, player, from, balanceOf(player, from) + sign * amount, cause);
  }
  if (to !== 'outside') {
    const sign = isDebt(to) ? -1 : 1;
    setBalance(ctx, player, to, balanceOf(player, to) + sign * amount, cause);
  }
}

/** Every place on a player's books except `outside`, in a fixed order. */
export function places(player: Readonly<PlayerState>): Place[] {
  return [
    'cash',
    'deposit',
    ...Object.keys(player.holdings).map((id) => `hold:${id}` as const),
    ...DEBT_KINDS.map((kind) => `debt:${kind}` as const),
  ];
}

/** Assets minus debts, in cents, without items (goals count items separately, §3 Wealth). */
export function financialNetWorth(player: Readonly<PlayerState>): number {
  let total = 0;
  for (const place of places(player))
    total += isDebt(place) ? -balanceOf(player, place) : balanceOf(player, place);
  return total;
}

/** Total owed across every debt. */
export function totalDebt(player: Readonly<PlayerState>): number {
  let total = 0;
  for (const kind of DEBT_KINDS) total += player.debts[kind].balance;
  return total;
}
