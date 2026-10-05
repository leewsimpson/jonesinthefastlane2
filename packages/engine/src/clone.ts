/** Deep copy of plain JSON-like data (objects, arrays, primitives). The reducer works on a copy, never its input. */
export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = clone(v);
  return out as T;
}
