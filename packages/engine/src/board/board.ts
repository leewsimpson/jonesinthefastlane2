/** Board distances and travel costs (engine-design §9, FR-02, FR-30). */
import type { Board, TransportMode } from '@fastlane/content';

/** Distance between two locations, the shorter way round the loop. Undefined if either is unknown. */
export function loopDistance(board: Board, from: string, to: string): number | undefined {
  const ids = board.locations.map((l) => l.id);
  let a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) return undefined;
  let forward = 0;
  let total = 0;
  for (const s of board.segments) total += s;
  while (a !== b) {
    forward += board.segments[a] ?? 0;
    a = (a + 1) % ids.length;
  }
  return Math.min(forward, total - forward);
}

/** Minutes, cents and energy for a trip of `distance` with `mode`, before modifiers. */
export function travelCost(mode: TransportMode, distance: number) {
  return {
    minutes: mode.minutesBase + distance * mode.minutesPerStep,
    money: mode.costBase + distance * mode.costPerStep,
    energy: distance * mode.energyPerStep,
  };
}
