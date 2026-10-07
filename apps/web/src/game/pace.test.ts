import { describe, expect, it } from 'vitest';
import {
  IDLE_CAP_MS,
  markTurnStart,
  medianWeekMs,
  newPace,
  parsePace,
  recordFirstPay,
  recordTurnEnd,
  tick,
} from './pace.ts';

describe('pace', () => {
  it('counts active time between inputs, capping idle gaps', () => {
    let p = tick(newPace(), 1_000);
    expect(p.playMs).toBe(0);
    p = tick(p, 11_000);
    expect(p.playMs).toBe(10_000);
    p = tick(p, 11_000 + 10 * IDLE_CAP_MS);
    expect(p.playMs).toBe(10_000 + IDLE_CAP_MS);
    // A clock that goes backwards adds nothing.
    expect(tick(p, 0).playMs).toBe(p.playMs);
  });

  it('records the first paycheck once per player and each week length', () => {
    let p = tick(newPace(), 0);
    p = tick(p, 30_000);
    p = recordFirstPay(p, 'p1');
    p = tick(p, 60_000);
    p = recordFirstPay(p, 'p1');
    expect(p.firstPayMs).toEqual({ p1: 30_000 });
    p = recordTurnEnd(p, 'p1', 1);
    p = markTurnStart(tick(p, 70_000));
    p = recordTurnEnd(tick(p, 160_000), 'p1', 2);
    p = markTurnStart(p);
    p = recordTurnEnd(tick(p, 230_000), 'p1', 3);
    expect(p.weeks.map((w) => w.ms)).toEqual([60_000, 90_000, 70_000]);
    expect(medianWeekMs(p, 'p1')).toBe(80_000);
    expect(medianWeekMs(p, 'p2')).toBeNull();
  });

  it('parses stored pace defensively and forgets the last input time', () => {
    expect(parsePace(undefined)).toEqual(newPace());
    const p = { ...newPace(), playMs: 5, lastAt: 99, firstPayMs: { p1: 3, p2: 'x' }, weeks: [1] };
    expect(parsePace(p)).toEqual({ ...newPace(), playMs: 5, firstPayMs: { p1: 3 } });
  });
});
