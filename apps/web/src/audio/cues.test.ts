import { describe, expect, it } from 'vitest';
import { NO_FX } from '../fx/map.ts';
import { sfxFor } from './cues.ts';

describe('sfxFor', () => {
  it('is silent when nothing happened', () => {
    expect(sfxFor(NO_FX)).toEqual([]);
  });

  it('plays a moment sting, then the coin shower', () => {
    expect(sfxFor({ ...NO_FX, coins: 5, moment: { kind: 'hired', job: 'cashier' } })).toEqual([
      'hired',
      'coin-burst',
    ]);
    expect(sfxFor({ ...NO_FX, moment: { kind: 'letGo', job: 'cashier' } })).toEqual(['laid-off']);
  });

  it('gives a plain stat change a good or bad blip, but not on top of anything else', () => {
    const good = { key: 'cash', stat: 'cash', delta: 100, tone: 'good' as const };
    const bad = { key: 'health', stat: 'health', delta: -1, tone: 'bad' as const };
    expect(sfxFor({ ...NO_FX, pops: [good] })).toEqual(['pop-good']);
    expect(sfxFor({ ...NO_FX, pops: [good, bad] })).toEqual(['pop-bad']);
    expect(sfxFor({ ...NO_FX, coins: 3, pops: [good] })).toEqual(['coin-burst']);
  });
});
