/**
 * Turns engine ids and slot values into copy. Content holds ids only; their text lives under derived keys
 * (engine-design §13). Slots carry ids for things with their own copy, cents for money and plain numbers otherwise.
 */
import type { GameState, Place, SlotParams, WorldState } from '@fastlane/engine';
import { duration, money, percent } from '../i18n/format.ts';
import { i18n, t } from '../i18n/i18n.ts';
import { content } from './engine.ts';

/** Copy prefix for each slot name the engine fills (`TEASERS`, `FEED_MOMENTS` in `@fastlane/content/keys`). */
const SLOT_PREFIX: Record<string, string> = {
  job: 'job',
  course: 'course',
  home: 'housing',
  item: 'item',
  quest: 'quest',
  news: 'news',
  debt: 'debt',
};
const MONEY_SLOTS = new Set(['amount', 'owed', 'rent']);
const PLAYER_SLOTS = new Set(['player', 'rival']);

export function playerName(state: GameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? id;
}

/** Slot values ready for interpolation. */
export function slotValues(state: GameState, params: SlotParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [slot, value] of Object.entries(params)) {
    const prefix = SLOT_PREFIX[slot];
    if (prefix && typeof value === 'string') out[slot] = t(`${prefix}.${value}`);
    else if (MONEY_SLOTS.has(slot) && typeof value === 'number') out[slot] = money(value);
    else if (PLAYER_SLOTS.has(slot) && typeof value === 'string')
      out[slot] = playerName(state, value);
    else out[slot] = value;
  }
  return out;
}

/** Jones's line for a feed moment. The engine picks the moment; the UI picks one of the numbered variants. */
export function feedLine(
  state: GameState,
  moment: string,
  params: SlotParams,
  salt: number,
): string {
  let count = 0;
  while (i18n.exists(`feed.${moment}.${count + 1}`)) count++;
  const n = count === 0 ? 1 : (salt % count) + 1;
  return t(`feed.${moment}.${n}`, slotValues(state, params));
}

/** What an action's `target` names, by the action's handler kind. */
const TARGET_PREFIX: Partial<Record<string, string>> = {
  'apply-job': 'job',
  enroll: 'course',
  'drop-course': 'course',
  buy: 'item',
  'rent-home': 'housing',
  subscribe: 'subscription',
  unsubscribe: 'subscription',
  deposit: 'asset',
  withdraw: 'asset',
  borrow: 'debt',
  repay: 'debt',
};

export function actionKind(actionId: string): string | undefined {
  return content.city.actions.find((a) => a.id === actionId)?.kind;
}

export function targetLabel(actionId: string, target: string): string {
  const prefix = TARGET_PREFIX[actionKind(actionId) ?? ''];
  return prefix ? t(`${prefix}.${target}`) : target;
}

/** A ledger place (engine-design §10.1) as copy. */
export function placeLabel(place: Place): string {
  if (place === 'cash' || place === 'deposit' || place === 'outside') return t(`place.${place}`);
  const [kind, id] = place.split(':');
  if (kind === 'hold') return t(`asset.${id}`);
  if (kind === 'debt') return t(`debt.${id}`);
  return place;
}

export const locationName = (id: string): string => t(`location.${id}`);

/** Today's money for a launch-day amount (FR-50), as the engine works it out. Display only. */
const indexed = (cents: number, bp: number) => Math.round((cents * bp) / 10_000);

/** What a target costs or pays over time, which an action's own preview doesn't show: wages, rent, fees, study. */
export function targetInfo(
  actionId: string,
  target: string,
  world: Readonly<WorldState>,
): string | null {
  const { city } = content;
  switch (actionKind(actionId)) {
    case 'apply-job': {
      const job = city.jobs.find((j) => j.id === target);
      return job
        ? t('info.job', {
            wage: money(indexed(job.wage, world.wageIndexBp)),
            location: locationName(job.location),
            risk: percent(job.aiExposureBp),
          })
        : null;
    }
    case 'subscribe': {
      const sub = city.subscriptions.find((s) => s.id === target);
      return sub
        ? t('info.weekly', { money: money(indexed(sub.weeklyCost, world.priceIndexBp)) })
        : null;
    }
    case 'rent-home': {
      const home = city.housing.find((h) => h.id === target);
      return home
        ? t('info.weekly', { money: money(indexed(home.rent, world.priceIndexBp)) })
        : null;
    }
    case 'enroll': {
      const course = city.courses.find((c) => c.id === target);
      return course ? t('info.study', { time: duration(course.studyMinutes) }) : null;
    }
    default:
      return null;
  }
}
