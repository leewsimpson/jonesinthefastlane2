/** Prices and wages move with the world's indices (FR-50). Base values are city data in launch-day cents (FR-33). */
import { applyBp } from '../math/fixed.ts';
import type { WorldState } from '../types/state.ts';

/** Under $10 prices move in nickel steps; from $10 up they move in whole dollars, so inflation never leaves a stray cent. */
const SMALL_STEP_CENTS = 5;
const WHOLE_DOLLAR_FROM_CENTS = 1000;
const DOLLAR_CENTS = 100;

/** Round an inflated amount in cents to a shop-friendly figure: nearest nickel below $10, nearest dollar from $10. */
export function roundPrice(cents: number): number {
  const step = cents >= WHOLE_DOLLAR_FROM_CENTS ? DOLLAR_CENTS : SMALL_STEP_CENTS;
  return Math.round(cents / step) * step;
}

/** A base price in today's money, rounded by `roundPrice`. */
export function price(world: Readonly<WorldState>, cents: number): number {
  return roundPrice(applyBp(cents, world.priceIndexBp));
}

/** A base wage in today's money. Wages lag prices (FR-50). */
export function wage(world: Readonly<WorldState>, cents: number): number {
  return applyBp(cents, world.wageIndexBp);
}
