/**
 * Pure, deterministic game engine (tech-stack §2). No `Math.random`, `Date.now` or DOM access.
 * Phase 0 ships only the package boundary; rules arrive in Phase 1.
 */
export const ENGINE_VERSION = '0.0.0';

/** Clamp a stat value into its inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
