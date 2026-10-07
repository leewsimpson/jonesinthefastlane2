/**
 * Smart defaults (ENG-02, simulator §2): the one-tap actions a busy player most likely wants where they stand —
 * eat if they haven't this week, work the longest shift they can, study the longest block they can. They are picked
 * from `localActions`, so they are ordinary legal actions with ordinary previews; nothing here changes state.
 */
import type { GameContent } from '@fastlane/content';
import type { Preview } from '../types/actions.ts';
import type { GameState } from '../types/state.ts';
import { localActions, playerById } from './plan.ts';

export type SmartKind = 'eat' | 'work' | 'study';

export interface SmartDefault {
  kind: SmartKind;
  preview: Preview & { available: true };
}

const KINDS: Partial<Record<string, SmartKind>> = {
  eat: 'eat',
  'eat-stored': 'eat',
  'work-shift': 'work',
  study: 'study',
};

/** At most one per kind, most pressing first: a missing meal, then work, then study. */
export function smartDefaults(content: GameContent, state: Readonly<GameState>): SmartDefault[] {
  if (state.phase.kind !== 'turn' || state.pending) return [];
  const player = playerById(state, state.phase.player);
  const kindOf = new Map(content.city.actions.map((a) => [a.id, KINDS[a.kind]]));
  const best = new Map<SmartKind, SmartDefault['preview']>();
  for (const p of localActions(content, state)) {
    if (!p.available || p.action.type !== 'perform') continue;
    const kind = kindOf.get(p.action.actionId);
    if (!kind) continue;
    const prev = best.get(kind);
    // Eat the cheapest meal; work and study as long as the time allows.
    const better =
      !prev || (kind === 'eat' ? p.plan.money < prev.plan.money : p.plan.time > prev.plan.time);
    if (better) best.set(kind, p);
  }
  const out: SmartDefault[] = [];
  const eat = best.get('eat');
  if (eat && player.mealsThisWeek === 0) out.push({ kind: 'eat', preview: eat });
  for (const kind of ['work', 'study'] as const) {
    const p = best.get(kind);
    if (p) out.push({ kind, preview: p });
  }
  return out;
}
