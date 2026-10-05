/**
 * Fixed-point helpers (engine-design §5). Percentages are integer basis points (10 000 = ×1) and weekly rates are
 * parts per million. All percentage maths goes through these, so rounding lives in one place.
 */

export const BP_ONE = 10_000;
export const PPM_ONE = 1_000_000;

/** `x × bp / 10 000`, rounded to the nearest integer. */
export function applyBp(x: number, bp: number): number {
  return Math.round((x * bp) / BP_ONE);
}

/** `x × ppm / 1 000 000`, rounded to the nearest integer. */
export function applyPpm(x: number, ppm: number): number {
  return Math.round((x * ppm) / PPM_ONE);
}

/** Clamp into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
