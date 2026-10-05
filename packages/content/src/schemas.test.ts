import { describe, expect, it } from 'vitest';
import { MetaSchema, meta } from './index.ts';

describe('content', () => {
  it('ships a valid manifest', () => {
    expect(meta.contentVersion).toBeGreaterThan(0);
  });

  it('rejects an invalid manifest', () => {
    expect(MetaSchema.safeParse({ contentVersion: 0, defaultCity: '' }).success).toBe(false);
  });
});
