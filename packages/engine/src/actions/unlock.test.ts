import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { endWeek, harness, perform } from '../__fixtures__/play.ts';

const content = structuredClone(fixtureContent);
for (const a of content.city.actions) if (a.id === 'rest') a.unlockWeek = 2;
const sub = content.city.subscriptions.find((s) => s.id === 'stream');
if (sub) sub.unlockWeek = 3;

const { engine, start, play, reason } = harness(content);

describe('progressive unlock (FR-15)', () => {
  it('locks an action until its unlock week and says when it opens', () => {
    const s = start();
    expect(reason(s, perform('rest'))).toBe('NOT_UNLOCKED');
    const p = engine.preview(s, perform('rest'));
    expect(p).toMatchObject({ available: false, reason: { code: 'NOT_UNLOCKED', unlockWeek: 2 } });
    const week2 = play(s, endWeek).state;
    expect(week2.week).toBe(2);
    expect(reason(week2, perform('rest'))).toBeNull();
  });

  it('locks a subscription target by its own unlock week', () => {
    const s = start();
    expect(reason(s, perform('sub', { target: 'stream' }))).toBe('NOT_UNLOCKED');
    const week3 = play(play(s, endWeek).state, endWeek).state;
    expect(week3.week).toBe(3);
    expect(reason(week3, perform('sub', { target: 'stream' }))).toBeNull();
  });
});
