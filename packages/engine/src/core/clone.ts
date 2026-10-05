/** Deep copy of plain JSON data (objects, arrays, primitives). `reduce` works on a copy, never its input. */
export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone) as T;
  const out: Record<string, unknown> = {};
  for (const k in value) out[k] = clone((value as Record<string, unknown>)[k]);
  return out as T;
}
