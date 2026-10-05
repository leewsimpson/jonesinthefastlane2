import { fileURLToPath } from 'node:url';
import { defaultContent } from '@fastlane/content';
import { describe, expect, it } from 'vitest';
import { applyOverride, loadOverride, merge } from './override.ts';

describe('override files (simulator §7)', () => {
  it('merges objects by key and id-arrays by id, appending new ids', () => {
    expect(merge({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 4 } })).toEqual({
      a: 1,
      b: { c: 2, d: 4 },
    });
    expect(
      merge(
        [
          { id: 'x', v: 1 },
          { id: 'y', v: 2 },
        ],
        [
          { id: 'y', v: 9 },
          { id: 'z', v: 0 },
        ],
      ),
    ).toEqual([
      { id: 'x', v: 1 },
      { id: 'y', v: 9 },
      { id: 'z', v: 0 },
    ]);
    expect(merge([1, 2], [3])).toEqual([3]);
  });

  it('changes one balance value and leaves the rest', () => {
    const patched = applyOverride(defaultContent, {
      balance: { aiDisruption: { baseRateBp: 500 } },
    });
    expect(patched.balance.aiDisruption.baseRateBp).toBe(500);
    expect(patched.balance.aiDisruption.hoursCutBp).toBe(
      defaultContent.balance.aiDisruption.hoursCutBp,
    );
    expect(patched.city).toEqual(defaultContent.city);
  });

  it('loads the example rent override', () => {
    const patched = loadOverride(
      defaultContent,
      fileURLToPath(new URL('../overrides/rent-plus-10.json', import.meta.url)),
    );
    expect(patched.city.housing.find((h) => h.id === 'studio')?.rent).toBe(27_500);
  });

  it('rejects an override that makes content invalid', () => {
    expect(() => applyOverride(defaultContent, { balance: { weekMinutes: 10 } })).toThrow();
    expect(() =>
      applyOverride(defaultContent, { city: { jobs: [{ id: 'picker', location: 'atlantis' }] } }),
    ).toThrow(/unknown location/);
  });
});
