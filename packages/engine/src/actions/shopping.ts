/** Shops, stored food and subscriptions (FR-52, FR-60). */
import type { GameContent } from '@fastlane/content';
import { price } from '../economy/prices.ts';
import type { PlayerState, WorldState } from '../types/state.ts';
import { type ActionHandler, applyPlan, fail, planFromData } from './common.ts';

/** Buy an item sold here. Durable items are owned once; groceries add stored meals (FR-60). */
export const buy: ActionHandler = {
  options: (ctx, def) =>
    ctx.content.city.items.filter((i) => i.shop === def.location).map((i) => ({ target: i.id })),
  plan(ctx, def, params) {
    const { content, player, state } = ctx;
    const item = content.city.items.find((i) => i.id === params.target);
    if (!item || item.shop !== def.location) return fail('BAD_TARGET');
    if (item.meals === undefined && player.items.includes(item.id)) return fail('ALREADY_OWNED');
    if (item.requiresItem && !player.items.includes(item.requiresItem)) return fail('NEEDS_ITEM');
    const plan = planFromData(ctx, def, params);
    plan.money += price(state.world, item.price);
    // Clothing raises the dress tier; the preview shows it like any other effect (FR-03).
    if (item.wardrobeTier !== undefined && item.wardrobeTier > player.stats.wardrobe)
      plan.effects.push({ stat: 'wardrobe', delta: item.wardrobeTier - player.stats.wardrobe });
    return plan;
  },
  apply(ctx, def, plan, params) {
    const { player, content } = ctx;
    const item = content.city.items.find((i) => i.id === params.target);
    if (!item) throw new Error('unreachable: the plan checked the item');
    applyPlan(ctx, def, plan);
    if (item.meals !== undefined) player.pantryMeals += item.meals;
    else player.items.push(item.id);
    ctx.emit({ type: 'itemBought', player: player.id, item: item.id });
  },
};

/** Eat a stored grocery meal at home. */
export const eatStored: ActionHandler = {
  plan(ctx, def, params) {
    if (ctx.player.pantryMeals === 0) return fail('NOTHING_STORED');
    return planFromData(ctx, def, params);
  },
  apply(ctx, def, plan) {
    applyPlan(ctx, def, plan);
    ctx.player.pantryMeals -= 1;
    ctx.player.mealsThisWeek += 1;
  },
};

/** Start a subscription. It charges at the end of every week, from this one (FR-52). */
export const subscribe: ActionHandler = {
  options: (ctx) => ctx.content.city.subscriptions.map((s) => ({ target: s.id })),
  plan(ctx, def, params) {
    const sub = ctx.content.city.subscriptions.find((s) => s.id === params.target);
    if (!sub) return fail('BAD_TARGET');
    if (ctx.player.subscriptions.includes(sub.id)) return fail('ALREADY_SUBSCRIBED');
    if (sub.requiresItem && !ctx.player.items.includes(sub.requiresItem)) return fail('NEEDS_ITEM');
    return planFromData(ctx, def, params);
  },
  apply(ctx, def, plan, params) {
    const id = params.target;
    if (!id) throw new Error('unreachable: the plan checked the target');
    applyPlan(ctx, def, plan);
    ctx.player.subscriptions.push(id);
    ctx.emit({ type: 'subscribed', player: ctx.player.id, subscription: id });
  },
};

export const unsubscribe: ActionHandler = {
  options: (ctx) => ctx.player.subscriptions.map((id) => ({ target: id })),
  plan(ctx, def, params) {
    if (!params.target || !ctx.player.subscriptions.includes(params.target))
      return fail('NOT_SUBSCRIBED');
    return planFromData(ctx, def, params);
  },
  apply(ctx, def, plan, params) {
    const id = params.target;
    if (!id) throw new Error('unreachable: the plan checked the target');
    applyPlan(ctx, def, plan);
    ctx.player.subscriptions = ctx.player.subscriptions.filter((s) => s !== id);
    ctx.emit({
      type: 'unsubscribed',
      player: ctx.player.id,
      subscription: id,
      reason: 'cancelled',
    });
  },
};

/** Weekly cost of the player's subscriptions at today's prices. */
export function subscriptionsWeekly(
  content: GameContent,
  world: Readonly<WorldState>,
  player: Readonly<PlayerState>,
): number {
  let total = 0;
  for (const sub of content.city.subscriptions)
    if (player.subscriptions.includes(sub.id)) total += price(world, sub.weeklyCost);
  return total;
}

/** FR-52: show the total weekly drain. */
export const subscriptionAudit: ActionHandler = {
  plan: planFromData,
  apply(ctx, def, plan) {
    applyPlan(ctx, def, plan);
    const { player } = ctx;
    ctx.emit({
      type: 'subscriptionAudit',
      player: player.id,
      weekly: subscriptionsWeekly(ctx.content, ctx.world, player),
      subscriptions: [...player.subscriptions],
    });
  },
};
