import { describe, expect, it } from 'vitest';
import { edit, endWeek, eventsOf, harness, perform, player } from '../__fixtures__/play.ts';

const { engine, start, play, reason } = harness();
const atShop = () =>
  edit(start(), (p) => {
    p.location = 'd';
  });
const buy = (target: string) => perform('shop', { target });

describe('items and shops (FR-60)', () => {
  it('lists what this shop sells and buys a durable item once', () => {
    const offered = engine
      .listActions(atShop())
      .map((o) => o.action)
      .filter((a) => a.type === 'perform' && a.actionId === 'shop');
    expect(offered).toHaveLength(5);
    const { state, events } = play(atShop(), buy('bike'));
    expect(player(state).items).toEqual(['bike']);
    expect(player(state).stats.cash).toBe(1200);
    expect(eventsOf(events, 'itemBought')).toEqual([
      { type: 'itemBought', player: 'p1', item: 'bike' },
    ]);
    expect(reason(state, buy('bike'))).toBe('ALREADY_OWNED');
    // The bike unlocks its transport mode (FR-02).
    expect(reason(state, { type: 'travel', to: 'a', mode: 'bike' })).toBeNull();
  });

  it('shows and applies a clothing upgrade to the dress tier', () => {
    expect(engine.preview(atShop(), buy('suit'))).toMatchObject({
      plan: { money: 400, effects: [{ stat: 'wardrobe', delta: 1 }] },
    });
    expect(player(play(atShop(), buy('suit')).state).stats.wardrobe).toBe(1);
  });

  it('stores groceries, which need a fridge, and eats them at home', () => {
    expect(reason(atShop(), buy('food-box'))).toBe('NEEDS_ITEM');
    const stocked = play(atShop(), buy('fridge'), buy('food-box'), buy('food-box')).state;
    expect(player(stocked).pantryMeals).toBe(6);
    expect(player(stocked).items).toEqual(['fridge']);
    const home = edit(stocked, (p) => {
      p.location = 'a';
    });
    const ate = play(home, perform('cook')).state;
    expect(player(ate)).toMatchObject({ pantryMeals: 5, mealsThisWeek: 1 });
    const empty = edit(start(), (p) => {
      p.pantryMeals = 0;
    });
    expect(reason(empty, perform('cook'))).toBe('NOTHING_STORED');
  });

  it('applies item weekly effects at the end of the week', () => {
    const owner = edit(start(), (p) => {
      p.items = ['gadget'];
    });
    const { events } = play(owner, endWeek);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'statChanged',
        stat: 'happiness',
        from: 50,
        to: 51,
        cause: { kind: 'step', id: 'stat-drift' },
      }),
    );
  });
});

describe('subscriptions (FR-52)', () => {
  it('charges each week, gives its buff and shows the total in an audit', () => {
    const subbed = play(start(), perform('sub', { target: 'stream' })).state;
    expect(player(subbed).subscriptions).toEqual(['stream']);
    expect(reason(subbed, perform('sub', { target: 'stream' }))).toBe('ALREADY_SUBSCRIBED');
    const audit = play(subbed, perform('audit'));
    expect(eventsOf(audit.events, 'subscriptionAudit')).toEqual([
      { type: 'subscriptionAudit', player: 'p1', weekly: 100, subscriptions: ['stream'] },
    ]);
    const { state, events } = play(subbed, endWeek);
    expect(eventsOf(events, 'moneyMoved')).toMatchObject([
      { from: 'cash', to: 'outside', amount: 100, reason: 'subscription' },
    ]);
    expect(player(state).stats.cash).toBe(1900);
  });

  it('cancels a subscription cash cannot cover rather than going into debt', () => {
    const broke = edit(play(start(), perform('sub', { target: 'stream' })).state, (p) => {
      p.stats.cash = 50;
    });
    const { state, events } = play(broke, endWeek);
    expect(player(state).subscriptions).toEqual([]);
    expect(eventsOf(events, 'unsubscribed')).toEqual([
      { type: 'unsubscribed', player: 'p1', subscription: 'stream', reason: 'unpaid' },
    ]);
  });

  it('counts delivered meals for the food check and can be cancelled', () => {
    const kit = play(start(), perform('sub', { target: 'meal-kit' })).state;
    expect(eventsOf(play(kit, endWeek).events, 'mealSkipped')).toEqual([]);
    const cancelled = play(kit, perform('unsub', { target: 'meal-kit' })).state;
    expect(player(cancelled).subscriptions).toEqual([]);
    expect(reason(cancelled, perform('unsub', { target: 'meal-kit' }))).toBe('NOT_SUBSCRIBED');
  });

  it('delivers no meals from a subscription the bills are about to cancel for non-payment', () => {
    const broke = edit(play(start(), perform('sub', { target: 'meal-kit' })).state, (p) => {
      p.stats.cash = 100;
    });
    const { state, events } = play(broke, endWeek);
    expect(eventsOf(events, 'mealSkipped')).toEqual([{ type: 'mealSkipped', player: 'p1' }]);
    expect(player(state).subscriptions).toEqual([]);
  });
});
