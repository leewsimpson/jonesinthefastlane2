/**
 * Override files (simulator §7): a JSON patch over content, so an experiment changes any balance value, job, item or
 * price without editing content. Objects merge key by key; arrays of objects with an `id` merge by id (unknown ids
 * are appended); any other value replaces. The result is validated like shipped content.
 */
import { readFileSync } from 'node:fs';
import { BalanceSchema, CitySchema, checkContent, type GameContent } from '@fastlane/content';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const hasId = (v: unknown): v is { id: string } & Record<string, Json> =>
  isObject(v) && typeof v.id === 'string';

export function merge(base: unknown, patch: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(patch) && patch.every(hasId) && base.every(hasId)) {
    const out = base.map((item) => {
      const change = patch.find((p) => p.id === item.id);
      return change ? merge(item, change) : item;
    });
    for (const p of patch) if (!base.some((b) => b.id === p.id)) out.push(p);
    return out;
  }
  if (isObject(base) && isObject(patch)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) out[key] = merge(base[key], value);
    return out;
  }
  return patch;
}

/** Content with the patch applied. Throws with every problem if the result isn't valid content. */
export function applyOverride(content: GameContent, patch: unknown): GameContent {
  if (!isObject(patch)) throw new Error('an override is a JSON object');
  const merged = merge(content, patch) as GameContent;
  const result: GameContent = {
    meta: content.meta,
    balance: BalanceSchema.parse(merged.balance),
    city: CitySchema.parse(merged.city),
  };
  const problems = checkContent(result);
  if (problems.length > 0)
    throw new Error(`override makes invalid content:\n${problems.join('\n')}`);
  return result;
}

export function loadOverride(content: GameContent, path: string): GameContent {
  return applyOverride(content, JSON.parse(readFileSync(path, 'utf8')));
}
