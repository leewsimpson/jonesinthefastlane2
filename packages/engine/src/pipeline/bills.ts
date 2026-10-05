/** P2: rent, lease renewals, eviction and subscriptions (FR-51, FR-52, FR-14). */
import type { PlayerCtx } from '../core/context.ts';
import { price } from '../economy/prices.ts';
import { applyBp, BP_ONE } from '../math/fixed.ts';
import { transfer } from '../money/ledger.ts';
import { changeStat } from '../stats/stats.ts';
import type { Cause } from '../types/events.ts';
import type { PipelineStep } from './types.ts';

const cause: Cause = { kind: 'step', id: 'bills' };

/**
 * Pay what cash covers; the rest becomes arrears (a debt), never negative cash (engine-design §10). Rent missed
 * `evictAfterMissed` weeks in a row evicts to the first housing tier, which is always free (FR-14).
 */
function payRent(ctx: PlayerCtx): void {
  const { player, content, config } = ctx;
  const housing = player.housing;
  if (housing.rent === 0) return;
  const due = housing.rent * config.turnLengthWeeks;
  const paid = Math.min(player.stats.cash, due);
  transfer(ctx, player, 'cash', 'outside', paid, 'rent', cause);
  if (paid < due) {
    transfer(ctx, player, 'debt:arrears', 'outside', due - paid, 'rent', cause);
    housing.missedRent += 1;
    changeStat(ctx, player, 'creditScore', content.balance.finance.credit.missedRent, cause);
    ctx.emit({
      type: 'rentMissed',
      player: player.id,
      owed: due - paid,
      missed: housing.missedRent,
    });
    if (housing.missedRent >= content.balance.housing.evictAfterMissed) {
      evict(ctx);
      return;
    }
  } else {
    housing.missedRent = 0;
    changeStat(ctx, player, 'creditScore', content.balance.finance.credit.onTimeRent, cause);
  }

  housing.leaseWeeksLeft -= config.turnLengthWeeks;
  if (housing.leaseWeeksLeft <= 0) renewLease(ctx);
}

/** A renewal raises the rent by a rolled hike, and never below today's listed rent (FR-51). */
function renewLease(ctx: PlayerCtx): void {
  const { player, content, world } = ctx;
  const housing = player.housing;
  const tier = content.city.housing.find((h) => h.id === housing.tier);
  if (!tier) throw new Error(`unknown housing ${housing.tier}`);
  const { min, max } = content.balance.housing.renewalHikeBp;
  const hiked = applyBp(housing.rent, BP_ONE + ctx.rng('bills').int(min, max));
  const from = housing.rent;
  housing.rent = Math.max(hiked, price(world, tier.rent));
  housing.leaseWeeksLeft = content.balance.housing.leaseWeeks;
  ctx.emit({ type: 'leaseRenewed', player: player.id, from, to: housing.rent });
}

/** Eviction: the deposit goes against the arrears, any rest comes back, and home is the free tier. */
function evict(ctx: PlayerCtx): void {
  const { player, content } = ctx;
  const housing = player.housing;
  const [fallback] = content.city.housing;
  if (!fallback) throw new Error('no housing tiers');
  const toArrears = Math.min(housing.deposit, player.debts.arrears.balance);
  transfer(ctx, player, 'deposit', 'debt:arrears', toArrears, 'repay', cause);
  transfer(ctx, player, 'deposit', 'cash', housing.deposit, 'lease-deposit', cause);
  const from = housing.tier;
  player.housing = { tier: fallback.id, rent: 0, leaseWeeksLeft: 0, deposit: 0, missedRent: 0 };
  changeStat(ctx, player, 'creditScore', content.balance.finance.credit.eviction, cause);
  ctx.emit({ type: 'evicted', player: player.id, from });
}

/** Each subscription charges weekly; one cash can't cover is cancelled rather than going into debt (FR-52). */
function chargeSubscriptions(ctx: PlayerCtx): void {
  const { player, content, world, config } = ctx;
  for (const sub of content.city.subscriptions) {
    if (!player.subscriptions.includes(sub.id)) continue;
    const cost = price(world, sub.weeklyCost) * config.turnLengthWeeks;
    if (cost <= player.stats.cash) {
      transfer(ctx, player, 'cash', 'outside', cost, 'subscription', cause);
    } else {
      player.subscriptions = player.subscriptions.filter((s) => s !== sub.id);
      ctx.emit({ type: 'unsubscribed', player: player.id, subscription: sub.id, reason: 'unpaid' });
    }
  }
}

export const bills: PipelineStep<PlayerCtx> = {
  id: 'bills',
  run(ctx) {
    payRent(ctx);
    chargeSubscriptions(ctx);
    return { done: true };
  },
};
