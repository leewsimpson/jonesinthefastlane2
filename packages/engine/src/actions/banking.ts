/** NeoBank (FR-53, FR-54): move money between cash, savings, investments and debts. */
import type { GameContent, LocationAction } from '@fastlane/content';
import { DEBT_KINDS, type DebtKind } from '@fastlane/content/keys';
import { transfer } from '../money/ledger.ts';
import type { PerformParams } from '../types/actions.ts';
import type { PlayerState } from '../types/state.ts';
import { type ActionHandler, actionCause, applyPlan, fail, planFromData } from './common.ts';

/** The presets, plus "all of it" when that's a different, positive amount. */
function amountOptions(def: LocationAction, all: number, target?: string): PerformParams[] {
  const amounts = [...(def.amounts ?? [])];
  if (all > 0 && !amounts.includes(all)) amounts.push(all);
  return amounts.map((amount) => (target === undefined ? { amount } : { target, amount }));
}

const isHolding = (player: Readonly<PlayerState>, id: string | undefined): id is string =>
  id !== undefined && player.holdings[id] !== undefined;
const isDebtKind = (id: string | undefined): id is DebtKind => DEBT_KINDS.includes(id as DebtKind);

/** The card limit for this credit score (FR-54). */
export function cardLimit(content: GameContent, creditScore: number): number {
  let limit = 0;
  for (const band of content.balance.finance.card.limits)
    if (creditScore >= band.minScore) limit = Math.max(limit, band.limit);
  return limit;
}

/** Cash into savings or an investment. */
export const deposit: ActionHandler = {
  options: (ctx, def) =>
    Object.keys(ctx.player.holdings).flatMap((id) => amountOptions(def, ctx.player.stats.cash, id)),
  plan(ctx, def, params) {
    if (!isHolding(ctx.player, params.target)) return fail('BAD_TARGET');
    const plan = planFromData(ctx, def, params);
    plan.money += params.amount ?? 0;
    return plan;
  },
  apply(ctx, def, plan, params) {
    const amount = params.amount ?? 0;
    applyPlan(ctx, def, { ...plan, money: plan.money - amount });
    transfer(ctx, ctx.player, 'cash', `hold:${params.target}`, amount, 'save', actionCause(def));
  },
};

/** Savings or an investment back into cash. */
export const withdraw: ActionHandler = {
  options: (ctx, def) =>
    Object.entries(ctx.player.holdings).flatMap(([id, held]) => amountOptions(def, held, id)),
  plan(ctx, def, params) {
    if (!isHolding(ctx.player, params.target)) return fail('BAD_TARGET');
    const amount = params.amount ?? 0;
    if (amount > (ctx.player.holdings[params.target] ?? 0)) return fail('BAD_AMOUNT');
    const plan = planFromData(ctx, def, params);
    plan.effects.unshift({ stat: 'cash', delta: amount });
    return plan;
  },
  apply(ctx, def, plan, params) {
    const amount = params.amount ?? 0;
    applyPlan(ctx, def, { ...plan, effects: plan.effects.filter((e) => e.stat !== 'cash') });
    transfer(
      ctx,
      ctx.player,
      `hold:${params.target}`,
      'cash',
      amount,
      'withdraw',
      actionCause(def),
    );
  },
};

/** Borrow on the credit card, up to the limit the credit score allows (FR-54). */
export const borrow: ActionHandler = {
  options: (_ctx, def) => amountOptions(def, 0),
  plan(ctx, def, params) {
    const amount = params.amount ?? 0;
    const { player, content } = ctx;
    if (player.debts.card.balance + amount > cardLimit(content, player.stats.creditScore))
      return fail('OVER_LIMIT');
    const plan = planFromData(ctx, def, params);
    plan.effects.unshift({ stat: 'cash', delta: amount });
    return plan;
  },
  apply(ctx, def, plan, params) {
    applyPlan(ctx, def, { ...plan, effects: plan.effects.filter((e) => e.stat !== 'cash') });
    transfer(ctx, ctx.player, 'debt:card', 'cash', params.amount ?? 0, 'borrow', actionCause(def));
  },
};

/** Pay down a debt: the card, the student loan or overdue bills. */
export const repay: ActionHandler = {
  options: (ctx, def) =>
    DEBT_KINDS.flatMap((kind) =>
      amountOptions(def, Math.min(ctx.player.debts[kind].balance, ctx.player.stats.cash), kind),
    ),
  plan(ctx, def, params) {
    if (!isDebtKind(params.target)) return fail('BAD_TARGET');
    const owed = ctx.player.debts[params.target].balance;
    if (owed === 0) return fail('NO_DEBT');
    if ((params.amount ?? 0) > owed) return fail('BAD_AMOUNT');
    const plan = planFromData(ctx, def, params);
    plan.money += params.amount ?? 0;
    return plan;
  },
  apply(ctx, def, plan, params) {
    const amount = params.amount ?? 0;
    applyPlan(ctx, def, { ...plan, money: plan.money - amount });
    transfer(
      ctx,
      ctx.player,
      'cash',
      `debt:${params.target as DebtKind}`,
      amount,
      'repay',
      actionCause(def),
    );
  },
};
