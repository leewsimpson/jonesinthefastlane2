import type { DomainEvent, GameState } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { engine } from './engine.ts';
import { hasNews, REPORT_STEPS, reportSteps } from './report.ts';

const newState = (): GameState =>
  engine.newGame({ seed: 'report', players: [{ name: 'Ana', controller: 'human' }] }).state;

describe('week report pages (FR-05)', () => {
  it('is one recap page when there is no weekend event', () => {
    const report = { player: 'p1', week: 1, events: [] as DomainEvent[] };
    expect(reportSteps(report, newState())).toEqual(['week']);
  });

  it('puts the weekend event card before the recap', () => {
    const events = [
      { type: 'weekendEvent', player: 'p1', event: 'x', category: 'social' },
    ] as unknown as DomainEvent[];
    expect(reportSteps({ player: 'p1', week: 1, events }, newState())).toEqual(['event', 'week']);
    expect(REPORT_STEPS).toEqual(['event', 'week']);
  });

  it('counts only a story starting or ending as news', () => {
    const e = (type: string) => [{ type }] as unknown as DomainEvent[];
    expect(hasNews(e('marketMoved'))).toBe(false);
    expect(hasNews(e('newsStarted'))).toBe(true);
    expect(hasNews(e('newsEnded'))).toBe(true);
  });
});
