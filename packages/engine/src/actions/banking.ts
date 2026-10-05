/** NeoBank (FR-53, FR-54): move money between cash, savings, investments and debts. */
import type { GameContent, LocationAction } from '@fastlane/content';
import { DEBT_KINDS, type DebtKind } from '@fastlane/content/keys';
import type { PlayerCtx } from '../core/context.ts';
import { transfer } from '../money/ledger.ts';
import type { PerformParams, Plan } from '../types/actions.ts';
import type { FlowReason } from '../types/events.ts';
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

/** The plan's own ledger moves, after its time, fee and effects. */
function applyTransfers(ctx: PlayerCtx, def: LocationAction, plan: Plan, reason: FlowReason) {
  for (const t of plan.transfers)
    transfer(ctx, ctx.player, t.from, t.to, t.amount, reason, actionCause(def));
}

/** Cash into savings or an investment. */
export const deposit: ActionHandler = {
  options: (ctx, def) =>
    Object.keys(ctx.player.holdings).flatMap((id) => amountOptions(def, ctx.player.stats.cash, id)),
  plan(ctx, def, params) {
    if (!isHolding(ctx.player, params.target)) return fail('BAD_TARGET');
    const plan = planFromData(ctx, def, params);
    const amount = params.amount ?? 0;
    plan.money += amount;
    plan.transfers.push({ from: 'cash', to: `hold:${params.target}`, amount });
    return plan;
  },
  apply(ctx, def, plan, params) {
    applyPlan(ctx, def, { ...plan, money: plan.money - (params.amount ?? 0) });
    applyTransfers(ctx, def, plan, 'save');
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
    plan.transfers.push({ from: `hold:${params.target}`, to: 'cash', amount });
    return plan;
  },
  apply(ctx, def, plan) {
    applyPlan(ctx, def, { ...plan, effects: plan.effects.slice(1) });
    applyTransfers(ctx, def, plan, 'withdraw');
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
    plan.transfers.push({ from: 'debt:card', to: 'cash', amount });
    return plan;
  },
  apply(ctx, def, plan) {
    applyPlan(ctx, def, { ...plan, effects: plan.effects.slice(1) });
    applyTransfers(ctx, def, plan, 'borrow');
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
    const amount = params.amount ?? 0;
    plan.money += amount;
    plan.transfers.push({ from: 'cash', to: `debt:${params.target}`, amount });
    return plan;
  },
  apply(ctx, def, plan, params) {
    applyPlan(ctx, def, { ...plan, money: plan.money - (params.amount ?? 0) });
    applyTransfers(ctx, def, plan, 'repay');
  },
};
