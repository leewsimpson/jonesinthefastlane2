import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content.ts';
import { edit, harness } from '../__fixtures__/play.ts';
import { newJobState } from '../jobs/jobs.ts';
import { smartDefaults } from './smart.ts';

const { engine, start } = harness();

describe('smart defaults (ENG-02)', () => {
  it('offers the longest shift the player can work, as a legal action', () => {
    const atWork = edit(start(), (p) => {
      p.location = 'c';
      p.job = newJobState(fixtureContent, 'clerk');
      p.mealsThisWeek = 1;
    });
    const [first, ...rest] = engine.smartDefaults(atWork);
    expect(rest).toEqual([]);
    expect(first?.kind).toBe('work');
    const longest = Math.max(
      ...engine
        .listActions(atWork)
        .filter((p) => p.available && p.action.type === 'perform' && p.action.actionId === 'work-c')
        .map((p) => (p.action.type === 'perform' ? (p.action.minutes ?? 0) : 0)),
    );
    expect(first?.preview.action).toMatchObject({ actionId: 'work-c', minutes: longest });
    expect(engine.reduce(atWork, first?.preview.action ?? { type: 'endWeek' }).ok).toBe(true);
  });

  it('suggests a meal only while the player has not eaten this week', () => {
    const hungry = edit(start(), (p) => {
      p.location = 'b';
      p.mealsThisWeek = 0;
    });
    expect(smartDefaults(fixtureContent, hungry).map((d) => d.kind)).toEqual(['eat']);
    const fed = edit(hungry, (p) => {
      p.mealsThisWeek = 1;
    });
    expect(smartDefaults(fixtureContent, fed)).toEqual([]);
  });

  it('suggests nothing that is unavailable', () => {
    const broke = edit(start(), (p) => {
      p.location = 'b';
      p.mealsThisWeek = 0;
      p.stats.cash = 0;
    });
    expect(smartDefaults(fixtureContent, broke)).toEqual([]);
  });
});
