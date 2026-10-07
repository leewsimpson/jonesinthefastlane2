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

/** What a building covers around its pad point: the art rises above it, the pad and label sit below. */
export function buildingBox(layout: BoardLayout, index: number) {
  const { x, y } = pointAt(layout, index);
  const { cell } = layout;
  // Tokens stand just left of the pad (Board.tsx), so the box reaches further on that side.
  return { l: x - cell * 0.66, r: x + cell * 0.5, t: y - cell * 0.82, b: y + cell * 0.32 };
}

/**
 * The open ground inside the loop, clear of the buildings and their labels: where the week panel sits, the way the
 * original game used the middle of its board for the clock and messages. The loop is mirror-symmetric, so the
 * rectangle is centred: each half-width that stops at a building's edge is tried, the buildings it still spans set
 * its top and bottom, and the one with the most usable room wins. Room counts only up to `want`, the panel's size.
 */
export function innerRect(
  layout: BoardLayout,
  want: { w: number; h: number } = { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY },
): { x: number; y: number; w: number; h: number } {
  const { cx, cy, rx, ry, count } = layout;
  const gap = 6;
  const boxes = Array.from({ length: count }, (_, i) => buildingBox(layout, i));
  const halves = new Set([rx]);
  for (const box of boxes) {
    if (box.r < cx) halves.add(cx - box.r - gap);
    if (box.l > cx) halves.add(box.l - gap - cx);
  }
  let best = { x: cx, y: cy, w: 0, h: 0 };
  let bestRoom = -1;
  for (const half of halves) {
    if (half <= 0) continue;
    let t = cy - ry;
    let b = cy + ry;
    for (const box of boxes) {
      if (box.r <= cx - half || box.l >= cx + half) continue;
      if ((box.t + box.b) / 2 < cy) t = Math.max(t, box.b + gap);
      else b = Math.min(b, box.t - gap);
    }
    const h = b - t;
    if (h <= 0) continue;
    const room = Math.min(2 * half, want.w) * Math.min(h, want.h);
    if (room > bestRoom) {
      bestRoom = room;
      best = { x: cx - half, y: t, w: 2 * half, h };
    }
  }
  return best;
}
