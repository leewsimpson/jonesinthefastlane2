import type { Board, TransportMode } from '@fastlane/content';

/** Steps between two locations, the shorter way round the loop (FR-30). Undefined if either is unknown. */
export function loopDistance(board: Board, from: string, to: string): number | undefined {
  const ids = board.locations.map((l) => l.id);
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) return undefined;
  const d = Math.abs(a - b);
  return Math.min(d, ids.length - d);
}

/** Time, money and energy for a trip of `steps` with `mode` (FR-02). */
export function travelCost(mode: TransportMode, steps: number) {
  return {
    hours: mode.hoursBase + steps * mode.hoursPerStep,
    cost: mode.costBase + steps * mode.costPerStep,
    energy: steps * mode.energyPerStep,
  };
}
