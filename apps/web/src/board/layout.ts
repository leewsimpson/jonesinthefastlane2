/**
 * Board geometry (art-direction §4, FR-30): the city's locations sit on a ring road, in loop order, evenly spaced by
 * distance along it, starting at the top. The road is a stadium (a rectangle with round ends) stretched along the
 * longer side of the board, so the loop uses the space whether the board is wide (desktop, phone portrait) or tall.
 * Positions are fractional, so a token can sit anywhere along the road while it travels.
 */
export interface BoardLayout {
  cx: number;
  cy: number;
  /** Half the road's width and height. */
  rx: number;
  ry: number;
  /** Building width in px. */
  cell: number;
  /** Token diameter in px. */
  token: number;
  count: number;
}

export function boardLayout(width: number, height: number, count: number): BoardLayout {
  const cell = Math.max(40, Math.min(130, Math.min(width / 4.6, height / 3.2)));
  const rx = Math.max(10, width / 2 - cell * 0.6);
  // Room above the top row for the buildings, and below the bottom row for the labels.
  const ry = Math.max(10, height / 2 - cell * 0.62 - 8);
  return {
    cx: width / 2,
    cy: height / 2 + cell * 0.28,
    rx,
    ry,
    cell,
    token: cell * 0.42,
    count,
  };
}

/** The road's round-end radius and the half-length of its straights. */
function stadium(layout: BoardLayout) {
  const wide = layout.rx >= layout.ry;
  const r = Math.min(layout.rx, layout.ry);
  const half = Math.abs(layout.rx - layout.ry);
  return { wide, r, half, length: 4 * half + 2 * Math.PI * r };
}

/** The point on the road at a fractional loop index, clockwise from the top. */
export function pointAt(layout: BoardLayout, index: number): { x: number; y: number } {
  const { wide, r, half, length } = stadium(layout);
  const n = layout.count;
  const arc = Math.PI * r;
  // Upright boards start mid-way round the left end, which the quarter turn below puts at the top.
  const start = wide ? 0 : 3 * half + 1.5 * arc;
  const s = (((((index % n) + n) % n) / n) * length + start) % length;
  // Walk a horizontal stadium centred on the origin, then turn it upright if the board is tall.
  // Where each stretch ends: top right half, right end, bottom, left end; then back along the top.
  const e0 = half;
  const e1 = e0 + arc;
  const e2 = e1 + 2 * half;
  const e3 = e2 + arc;
  let x: number;
  let y: number;
  if (s < e0) {
    x = s;
    y = -r;
  } else if (s < e1) {
    const a = -Math.PI / 2 + (s - e0) / r;
    x = half + r * Math.cos(a);
    y = r * Math.sin(a);
  } else if (s < e2) {
    x = half - (s - e1);
    y = r;
  } else if (s < e3) {
    const a = Math.PI / 2 + (s - e2) / r;
    x = -half + r * Math.cos(a);
    y = r * Math.sin(a);
  } else {
    x = -half + (s - e3);
    y = -r;
  }
  return wide ? { x: layout.cx + x, y: layout.cy + y } : { x: layout.cx - y, y: layout.cy + x };
}

/** Signed loop distance from `from` to `to` the shorter way round (engine-design §9: travel takes the shorter way). */
export function loopDelta(from: number, to: number, count: number): number {
  let d = (((to - from) % count) + count) % count;
  if (d > count / 2) d -= count;
  return d;
}

/** One step of token motion: move `pos` toward `target` along the loop by at most `step`. */
export function stepToward(pos: number, target: number, step: number, count: number): number {
  const d = loopDelta(pos, target, count);
  if (Math.abs(d) <= step) return target;
  return (((pos + Math.sign(d) * step) % count) + count) % count;
}
