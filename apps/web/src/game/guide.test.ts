import type { Action, GameState } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { createGameStore } from '../store/game.ts';
import { content, engine } from './engine.ts';
import { mealPlaces, nextHint, pickTrip, weekNeeds } from './guide.ts';

function game() {
  const store = createGameStore();
  store.getState().start('s', {
    seed: 'guide',
    players: [
      { name: 'Ana', controller: 'human' },
      { name: 'Jones', controller: 'ai' },
    ],
  });
  const act = (a: Action) => {
    if (!store.getState().dispatch(a)) throw new Error(`refused ${JSON.stringify(a)}`);
  };
  const state = (): GameState => {
    const s = store.getState().session?.state;
    if (!s) throw new Error('no session');
    return s;
  };
  const me = () => {
    const p = state().players[0];
    if (!p) throw new Error('no player');
    return p;
  };
  const hint = () => {
    const previews = engine.listActions(state());
    const kinds = new Map(content.city.actions.map((a) => [a.id, a.kind]));
    const here = { canEat: false, canStudy: false };
    for (const p of previews)
      if (p.available && p.action.type === 'perform') {
        const k = kinds.get(p.action.actionId);
        if (k === 'eat' || k === 'eat-stored') here.canEat = true;
        if (k === 'study') here.canStudy = true;
      }
    return nextHint(content, state(), me(), here);
  };
  return { act, state, me, hint };
}

describe('week guide (ENG-20)', () => {
  it('starts by sending a jobless player to the job board, then to work', () => {
    const g = game();
    expect(weekNeeds(content, g.state(), g.me())).toMatchObject({ meals: 0, work: null });
    expect(g.hint()).toMatchObject({ id: 'findJob', dest: 'joblink' });

    g.act({ type: 'travel', to: 'joblink', mode: 'transit' });
    expect(g.hint()).toMatchObject({ id: 'pickJob', dest: null });

    g.act({ type: 'perform', actionId: 'apply-job', target: 'picker' });
    const needs = weekNeeds(content, g.state(), g.me());
    expect(needs.work).toMatchObject({
      location: 'fulfillment',
      minutesLeft: content.balance.jobs.maxWeeklyMinutes,
    });
    // A meal can wait while there are hours to work and plenty of week left.
    expect(g.hint()).toMatchObject({ id: 'workAt', dest: 'fulfillment' });

    g.act({ type: 'travel', to: 'fulfillment', mode: 'transit' });
    expect(g.hint()).toMatchObject({ id: 'workHere', dest: null });
  });

  it('puts food first once the week is running out', () => {
    const g = game();
    g.act({ type: 'travel', to: 'joblink', mode: 'transit' });
    g.act({ type: 'perform', actionId: 'apply-job', target: 'picker' });
    g.act({ type: 'travel', to: 'fulfillment', mode: 'transit' });
    for (let i = 0; i < 5; i++)
      g.act({ type: 'perform', actionId: 'work-fulfillment', minutes: 480 });
    const h = g.hint();
    expect(h.id).toBe('eatAt');
    expect(h.dest).toBe(mealPlaces(content, 'fulfillment')[0]);
  });

  it('lists meal places nearest first', () => {
    const places = mealPlaces(content, 'burger-bot');
    expect(places[0]).toBe('burger-bot');
    expect(places).toContain('freshmart');
  });
});

describe('pickTrip (FR-02)', () => {
  it('uses the chosen mode when it can go, else the cheapest that can', () => {
    const g = game();
    const previews = engine.listActions(g.state());
    expect(pickTrip(previews, 'joblink', 'rideshare')?.action.mode).toBe('rideshare');
    // No e-scooter owned: fall back to the free mode.
    expect(pickTrip(previews, 'joblink', 'e-scooter')?.action.mode).toBe('walk');
    expect(pickTrip(previews, g.me().location, 'walk')).toBeNull();
  });
});
