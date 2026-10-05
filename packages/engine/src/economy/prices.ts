/** Prices and wages move with the world's indices (FR-50). Base values are city data in launch-day cents (FR-33). */
import { applyBp } from '../math/fixed.ts';
import type { WorldState } from '../types/state.ts';

/** A base price in today's money. */
export function price(world: Readonly<WorldState>, cents: number): number {
  return applyBp(cents, world.priceIndexBp);
}

/** A base wage in today's money. Wages lag prices (FR-50). */
export function wage(world: Readonly<WorldState>, cents: number): number {
  return applyBp(cents, world.wageIndexBp);
}
