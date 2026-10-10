/** Prices and wages move with the world's indices (FR-50). Base values are city data in launch-day cents (FR-33). */
import { applyBp } from '../math/fixed.ts';
import type { WorldState } from '../types/state.ts';

/** Shop prices move in nickel steps so inflation never leaves a stray cent ($25.01) on a $25 item. */
const PRICE_STEP_CENTS = 5;

/** A base price in today's money, rounded to the nearest 5 cents. */
export function price(world: Readonly<WorldState>, cents: number): number {
  return Math.round(applyBp(cents, world.priceIndexBp) / PRICE_STEP_CENTS) * PRICE_STEP_CENTS;
}

/** A base wage in today's money. Wages lag prices (FR-50). */
export function wage(world: Readonly<WorldState>, cents: number): number {
  return applyBp(cents, world.wageIndexBp);
}
