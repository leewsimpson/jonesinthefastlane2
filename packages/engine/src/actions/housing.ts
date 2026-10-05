/** LeaseLord (FR-51): sign a lease on another housing tier. */
import { price } from '../economy/prices.ts';
import { transfer } from '../money/ledger.ts';
import { type ActionHandler, actionCause, applyPlan, fail, planFromData } from './common.ts';

/**
 * Move to a housing tier: the old deposit comes back, the new one is paid, and a fresh lease starts at today's rent.
 * Needs a credit check (FR-51) and no rent owed. The first week's rent is charged with the bills (FR-05).
 */
export const rentHome: ActionHandler = {
  options: (ctx) => ctx.content.city.housing.map((h) => ({ target: h.id })),
  plan(ctx, def, params) {
    const { content, player, state } = ctx;
    const tier = content.city.housing.find((h) => h.id === params.target);
    if (!tier) return fail('BAD_TARGET');
    if (tier.id === player.housing.tier) return fail('ALREADY_THERE');
    if (player.housing.missedRent > 0 || player.debts.arrears.balance > 0) return fail('RENT_OWED');
    if (player.stats.creditScore < tier.minCreditScore) return fail('CREDIT_CHECK');
    const plan = planFromData(ctx, def, params);
    // The old deposit comes back before the new one is paid, so only the difference has to be in cash.
    const refund = player.housing.deposit;
    const deposit = price(state.world, tier.deposit);
    const net = deposit - refund;
    if (net > 0) plan.money += net;
    else if (net < 0) plan.effects.unshift({ stat: 'cash', delta: -net });
    if (refund > 0) plan.transfers.push({ from: 'deposit', to: 'cash', amount: refund });
    if (deposit > 0) plan.transfers.push({ from: 'cash', to: 'deposit', amount: deposit });
    return plan;
  },
  apply(ctx, def, plan, params) {
    const { player, content, world } = ctx;
    const tier = content.city.housing.find((h) => h.id === params.target);
    if (!tier) throw new Error('unreachable: the plan checked the tier');
    const cause = actionCause(def);
    const net = price(world, tier.deposit) - player.housing.deposit;
    // The action's own time, fee and effects as usual; the deposits move between the player's own places.
    applyPlan(ctx, def, {
      ...plan,
      money: plan.money - Math.max(0, net),
      effects: net < 0 ? plan.effects.slice(1) : plan.effects,
    });
    for (const t of plan.transfers)
      transfer(ctx, player, t.from, t.to, t.amount, 'lease-deposit', cause);
    const from = player.housing.tier;
    player.housing.tier = tier.id;
    player.housing.rent = price(world, tier.rent);
    player.housing.leaseWeeksLeft = content.balance.housing.leaseWeeks;
    ctx.emit({ type: 'moved', player: player.id, from, to: tier.id, rent: player.housing.rent });
  },
};
