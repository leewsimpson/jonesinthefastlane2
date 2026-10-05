/** P3: savings interest, debt interest, payments due, collections and credit score (FR-53, FR-54, FR-14). */
import { DEBT_KINDS, type DebtKind, SAVINGS_ID } from '@fastlane/content/keys';
import type { PlayerCtx } from '../core/context.ts';
import { newsEffect } from '../hooks/news.ts';
import { applyBp, applyPpm } from '../math/fixed.ts';
import { transfer } from '../money/ledger.ts';
import { changeStat } from '../stats/stats.ts';
import type { Cause } from '../types/events.ts';
import type { PipelineStep } from './types.ts';

const cause: Cause = { kind: 'step', id: 'interest-debt' };

/** Card and student debt need a minimum payment; arrears are due in full but carry no interest or late fee. */
function paymentDue(ctx: PlayerCtx, kind: DebtKind, balance: number): number {
  if (kind === 'arrears') return balance;
  const { minPaymentBp, minPayment } = ctx.content.balance.finance;
  const weekly = Math.max(minPayment, applyBp(balance, minPaymentBp));
  return Math.min(balance, weekly * ctx.config.turnLengthWeeks);
}

/**
 * Pay what's due from cash. A shortfall is a missed payment: card and student debt take a late fee and a credit-score
 * hit; any debt missed `collectionsAfter` weeks in a row goes to collections (FR-14).
 */
function payDebt(ctx: PlayerCtx, kind: DebtKind): void {
  const { player, content } = ctx;
  const finance = content.balance.finance;
  const debt = player.debts[kind];
  if (debt.balance === 0) {
    debt.missed = 0;
    debt.collections = false;
    return;
  }
  const due = paymentDue(ctx, kind, debt.balance);
  const paid = Math.min(player.stats.cash, due);
  transfer(ctx, player, 'cash', `debt:${kind}`, paid, 'repay', cause);
  if (paid === due) {
    debt.missed = 0;
    if (kind !== 'arrears') changeStat(ctx, player, 'creditScore', finance.credit.onTime, cause);
    if (debt.balance === 0) debt.collections = false;
    return;
  }
  debt.missed += 1;
  ctx.emit({ type: 'paymentMissed', player: player.id, debt: kind, due: due - paid });
  if (kind !== 'arrears') {
    transfer(ctx, player, `debt:${kind}`, 'outside', finance.lateFee, 'fee', cause);
    changeStat(ctx, player, 'creditScore', finance.credit.missed, cause);
  }
  if (debt.missed >= finance.collectionsAfter && !debt.collections) {
    debt.collections = true;
    transfer(ctx, player, `debt:${kind}`, 'outside', finance.collectionsFee, 'fee', cause);
    changeStat(ctx, player, 'creditScore', finance.credit.collections, cause);
    ctx.emit({ type: 'collections', player: player.id, debt: kind });
  }
}

export const interestAndDebt: PipelineStep<PlayerCtx> = {
  id: 'interest-debt',
  run(ctx) {
    const { player, content, config } = ctx;
    const finance = content.balance.finance;
    const weeks = config.turnLengthWeeks;
    // Rate news moves both rates (FR-72); neither goes below zero.
    const savingsPpm = Math.max(
      0,
      finance.savingsWeeklyPpm + newsEffect(content, ctx.world, 'savingsPpm'),
    );
    const cardPpm = Math.max(0, finance.card.weeklyPpm + newsEffect(content, ctx.world, 'cardPpm'));
    const savings = player.holdings[SAVINGS_ID] ?? 0;
    const earned = applyPpm(savings, savingsPpm * weeks);
    transfer(ctx, player, 'outside', `hold:${SAVINGS_ID}`, earned, 'interest', cause);
    const rates: Partial<Record<DebtKind, number>> = {
      card: cardPpm,
      student: finance.studentWeeklyPpm,
    };
    for (const kind of DEBT_KINDS) {
      const ppm = rates[kind] ?? 0;
      const interest = applyPpm(player.debts[kind].balance, ppm * weeks);
      transfer(ctx, player, `debt:${kind}`, 'outside', interest, 'interest', cause);
    }
    for (const kind of DEBT_KINDS) payDebt(ctx, kind);
    return { done: true };
  },
};
