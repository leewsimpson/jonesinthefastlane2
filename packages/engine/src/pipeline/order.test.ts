import { expect, it } from 'vitest';
import { defaultPipeline } from './order.ts';

it('runs the end-of-week steps in FR-05 order (change deliberately)', () => {
  expect({
    perPlayer: defaultPipeline.perPlayer.map((s) => s.id),
    perRound: defaultPipeline.perRound.map((s) => s.id),
  }).toMatchInlineSnapshot(`
    {
      "perPlayer": [
        "food-check",
        "bills",
        "interest-debt",
        "job-checks",
        "stat-drift",
        "weekend-event",
        "quest-progress",
      ],
      "perRound": [
        "market",
        "news",
        "goal-check",
        "teasers",
      ],
    }
  `);
});
