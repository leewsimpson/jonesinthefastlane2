/**
 * Board geometry (art-direction §4, FR-30): a town block. The ring road is a tight-cornered rectangle round the park,
 * its straights carrying on as side streets (`streets`); the
 * buildings stand outside it, in rows along the top and bottom and in columns down the sides, the way the original
 * game framed its town square. A wide board puts most buildings in the rows (one per side); a tall board (phone
 * portrait) puts them in the columns. Locations keep their loop order, clockwise from the top left, so travel
 * distance is unchanged. Each building has a stop: the nearest point of the road, where its tokens stand. Positions
 * along the loop are fractional, so a token can sit anywhere on the road while it travels.
 */
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Site {
  /** Where the building meets the pavement: the bottom centre of its art. */
  x: number;
  y: number;
  side: Side;
}

export interface BoardLayout {
  /** The board's size. */
  width: number;
  height: number;
  /** The road's centre line: its middle, half-width and half-height, and corner radius. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  corner: number;
  /** Half the road's width, in px. */
  road: number;
  /** Building width in px. */
  cell: number;
  /** Token diameter in px. */
  token: number;
  count: number;
  sites: Site[];
  /** Each location's stop, as a distance along the road, increasing in loop order (it may run past one lap). */
  stops: number[];
  /** The road's length. */
  length: number;
  /** The skyline band across the top: the town's ground starts below it. */
  sky: number;
  /** The street along the bottom edge, below the bottom row, as its top edge (the board's height when none). */
  foot: number;
}

/** Building height as a share of its width: the art is a little wider than tall. */
const TALL = 0.9;
/** Space between the road's kerb and a building. */
const PAVEMENT = 10;
const MARGIN = 8;
/** A building's plot reaches this share of its width past the art on either side. */
const PLOT_PAD = 0.05;

/** How many buildings go on each side, clockwise from the top. */
function sideCounts(count: number, wide: boolean): Record<Side, number> {
  const ends = Math.min(2, count);
  const rest = count - ends;
  const a = Math.ceil(rest / 2);
  const b = rest - a;
  return wide
    ? { top: a, right: ends > 0 ? 1 : 0, bottom: b, left: ends > 1 ? 1 : 0 }
    : { top: ends > 0 ? 1 : 0, right: a, bottom: ends > 1 ? 1 : 0, left: b };
}

/** Evenly spread `k` centres across [a, b]: one in the middle, or from end to end. */
function spread(k: number, a: number, b: number): number[] {
  if (k <= 0) return [];
  if (k === 1) return [(a + b) / 2];
  return Array.from({ length: k }, (_, j) => a + ((b - a) * j) / (k - 1));
}

interface Frame {
  cell: number;
  road: number;
  topBase: number;
  bottomBase: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  foot: number;
}

/** The road and building rows for a building width; null when the board can't hold them. */
function frameFor(
  width: number,
  height: number,
  cell: number,
  n: Record<Side, number>,
  sky: number,
  street: boolean,
): Frame | null {
  const road = Math.max(6, cell * 0.11);
  const kerb = road + PAVEMENT;
  // Rows: the top row stands on the road's upper kerb, its roofs against the skyline; the bottom row hangs below the
  // lower kerb, with a street along the board's foot when there is room for one (art-direction §1).
  const topBase = Math.max(MARGIN, sky - cell * 0.15) + cell * TALL;
  const foot = street ? height - road * 2.2 : height;
  const bottomBase = foot - PAVEMENT - cell * 0.04;
  const top = topBase + kerb;
  const bottom = bottomBase - cell * TALL - kerb;
  // Columns sit outside the road on either side, when there are any.
  const colW = n.left + n.right > 0 ? cell * 1.05 : 0;
  const left = MARGIN + colW + kerb;
  const right = width - MARGIN - colW - kerb;
  // A row holds its buildings on their plots (`PLOT_PAD` either side) with a side street between each pair (`townPlan`).
  const rowFits = (k: number) =>
    k * cell * (1 + 2 * PLOT_PAD) + (k - 1) * road * 2 <= width - 2 * MARGIN;
  const band = bottom - top - 2 * kerb;
  const colFits = (k: number) => k * cell * (TALL + 0.12) <= band + cell * TALL;
  const park = Math.min(right - left, bottom - top) - 2 * kerb;
  if (!rowFits(n.top) || !rowFits(n.bottom) || !colFits(n.left) || !colFits(n.right)) return null;
  // The square stays big enough to read as a park, about as tall as a building, as the concept lays it out.
  if (park < cell * 0.78) return null;
  return { cell, road, topBase, bottomBase, left, right, top, bottom, foot };
}

/** A point on the road at distance `s` from its start (the top-left corner), going clockwise. */
export function roadPoint(l: Pick<BoardLayout, 'cx' | 'cy' | 'rx' | 'ry' | 'corner'>, s: number) {
  const { cx, cy, rx, ry, corner: c } = l;
  const w = 2 * (rx - c);
  const h = 2 * (ry - c);
  const arc = (Math.PI / 2) * c;
  const length = 2 * w + 2 * h + 4 * arc;
  let d = ((s % length) + length) % length;
  const L = cx - rx;
  const R = cx + rx;
  const T = cy - ry;
  const B = cy + ry;
  const corner = (ox: number, oy: number, from: number) => {
    const a = from + d / c;
    return { x: ox + c * Math.cos(a), y: oy + c * Math.sin(a) };
  };
  // Top-left corner, top, top-right corner, right, bottom-right corner, bottom, bottom-left corner, left.
  if (d < arc) return corner(L + c, T + c, Math.PI);
  d -= arc;
  if (d < w) return { x: L + c + d, y: T };
  d -= w;
  if (d < arc) return corner(R - c, T + c, -Math.PI / 2);
  d -= arc;
  if (d < h) return { x: R, y: T + c + d };
  d -= h;
  if (d < arc) return corner(R - c, B - c, 0);
  d -= arc;
  if (d < w) return { x: R - c - d, y: B };
  d -= w;
  if (d < arc) return corner(L + c, B - c, Math.PI / 2);
  d -= arc;
  return { x: L, y: B - c - d };
}

function roadLength(l: Pick<BoardLayout, 'rx' | 'ry' | 'corner'>): number {
  return 4 * (l.rx - l.corner) + 4 * (l.ry - l.corner) + 2 * Math.PI * l.corner;
}

/** The distance along the road of its point nearest `p`. */
function nearestStop(
  l: Parameters<typeof roadPoint>[0],
  length: number,
  p: { x: number; y: number },
) {
  const samples = 720;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples; i++) {
    const s = (i / samples) * length;
    const q = roadPoint(l, s);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function boardLayout(width: number, height: number, count: number): BoardLayout {
  const wide = width >= height;
  const n = sideCounts(count, wide);
  // The biggest building width that fits, up to a cap, shrinking from there.
  // No small fixed cap: on a big screen the town grows with the board, so the park stays about a building tall.
  let cell = Math.max(40, Math.min(480, width / 4.4, height / 3.2));
  // A wide board shows a band of skyline and a street along its foot; a tall one keeps its height for buildings.
  const sky = wide ? Math.min(240, height * 0.13) : Math.min(40, height * 0.04);
  let f = frameFor(width, height, cell, n, sky, wide);
  while (!f && cell > 40) {
    cell = Math.max(40, cell * 0.95);
    f = frameFor(width, height, cell, n, sky, wide);
  }
  // A board too small for anything still gets a usable (if crowded) frame.
  f ??= {
    cell,
    road: 6,
    topBase: MARGIN + cell * TALL,
    bottomBase: height - MARGIN - cell * 0.12,
    left: width * 0.3,
    right: width * 0.7,
    top: height * 0.35,
    bottom: Math.max(height * 0.35 + 2, height * 0.65),
    foot: height,
  };
  const rx = Math.max(4, (f.right - f.left) / 2);
  const ry = Math.max(4, (f.bottom - f.top) / 2);
  // Tight corners, so the ring reads as streets meeting at junctions rather than a racetrack.
  const corner = Math.min(rx, ry, cell * 0.16);
  const geo = { cx: (f.left + f.right) / 2, cy: (f.top + f.bottom) / 2, rx, ry, corner };
  const length = roadLength(geo);

  // Sites, clockwise from the top left: the top row left to right, the right column down, the bottom row right to
  // left, the left column up.
  const half = cell / 2;
  const colX = MARGIN + cell * 0.52;
  // Columns fill the band between the rows: the first building's roof under the top row, the last one's base above
  // the bottom row's roofs.
  const bandTop = f.topBase + 6;
  const bandBottom = f.bottomBase - cell * TALL - 6;
  const colYs = (k: number) => spread(k, bandTop + cell * TALL, bandBottom);
  const rowXs = (k: number) =>
    k === 1 ? [width / 2] : spread(k, MARGIN + half + 2, width - MARGIN - half - 2);
  const sites: Site[] = [
    ...rowXs(n.top).map((x) => ({ x, y: f.topBase, side: 'top' as const })),
    ...colYs(n.right).map((y) => ({ x: width - colX, y, side: 'right' as const })),
    ...rowXs(n.bottom)
      .reverse()
      .map((x) => ({ x, y: f.bottomBase, side: 'bottom' as const })),
    ...colYs(n.left)
      .reverse()
      .map((y) => ({ x: colX, y, side: 'left' as const })),
  ];
  // A building's stop faces its front door onto the road: below the top row, above the bottom row, beside a column.
  const door = (s: Site) =>
    s.side === 'top'
      ? { x: s.x, y: s.y + 1 }
      : s.side === 'bottom'
        ? { x: s.x, y: s.y - cell * TALL }
        : { x: s.side === 'left' ? s.x + half : s.x - half, y: s.y - cell * TALL * 0.35 };
  // Stops run round the loop in order, measured on from the first one (they may pass the road's start). Odd boards
  // fall back to even spacing.
  const raw = sites.map((s) => nearestStop(geo, length, door(s)));
  const first = raw[0] ?? 0;
  let stops = raw.map((s) => first + ((((s - first) % length) + length) % length));
  const ordered = stops.every((s, i) => i === 0 || s > (stops[i - 1] as number));
  if (!ordered) stops = sites.map((_, i) => first + (i / count) * length);
  return {
    width,
    height,
    ...geo,
    road: f.road,
    cell,
    token: cell * 0.36,
    count,
    sites,
    stops,
    length,
    sky,
    foot: f.foot,
  };
}

/** The point on the road at a fractional loop index: between two stops it follows the road. */
export function pointAt(layout: BoardLayout, index: number): { x: number; y: number } {
  const { count, stops, length } = layout;
  if (count === 0) return { x: layout.cx, y: layout.cy };
  const i = ((index % count) + count) % count;
  const i0 = Math.floor(i);
  const t = i - i0;
  const a = stops[i0] as number;
  let b = stops[(i0 + 1) % count] as number;
  if (b <= a) b += length;
  return roadPoint(layout, a + (b - a) * t);
}

/** Where location `index`'s building stands. */
export function siteAt(layout: BoardLayout, index: number): Site {
  const n = layout.count;
  return layout.sites[((index % n) + n) % n] ?? { x: layout.cx, y: layout.cy, side: 'top' };
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

/** What a building's art covers, standing on its site. */
export function buildingBox(layout: BoardLayout, index: number) {
  const { x, y } = siteAt(layout, index);
  const { cell } = layout;
  return { l: x - cell / 2, r: x + cell / 2, t: y - cell * TALL, b: y };
}

/** The park: the open ground inside the road, clear of its kerbs. */
export function innerRect(layout: BoardLayout): { x: number; y: number; w: number; h: number } {
  const { cx, cy, rx, ry, road } = layout;
  const k = road + PAVEMENT;
  return {
    x: cx - rx + k,
    y: cy - ry + k,
    w: Math.max(0, 2 * (rx - k)),
    h: Math.max(0, 2 * (ry - k)),
  };
}

/** The park's planted ground, inside the paved walk round the square (art-direction §1, as the concept paves it). */
export function parkBed(layout: BoardLayout): { x: number; y: number; w: number; h: number } {
  const box = innerRect(layout);
  const walk = Math.max(6, layout.cell * 0.06);
  return {
    x: box.x + walk,
    y: box.y + walk,
    w: Math.max(0, box.w - walk * 2),
    h: Math.max(0, box.h - walk * 2),
  };
}

/**
 * The town square's layout (art-direction §1): two paved paths crossing the lawn, edge to edge through its middle,
 * meeting at a round plaza with the fountain. The plaza is an ellipse, as the board's three-quarter view sees a
 * circle; `rx` and `ry` are its radii. The four lawns between the paths are planted (`scenery.ts`).
 */
export function parkPlan(layout: BoardLayout) {
  const bed = parkBed(layout);
  const path = Math.max(6, layout.cell * 0.075);
  const x = bed.x + bed.w / 2;
  const y = bed.y + bed.h / 2;
  const rx = Math.max(path, Math.min(bed.w * 0.22, bed.h * 0.62, layout.cell * 0.55));
  return { bed, path, plaza: { x, y, rx, ry: rx * 0.62 } };
}

/** A zebra crossing: its centre, and which way the traffic it crosses runs. */
export interface Crossing {
  x: number;
  y: number;
  traffic: 'h' | 'v';
}

/** Crossings where the park's paths meet the ring road on all four sides, so the square joins the town. */
export function parkCrossings(layout: BoardLayout): Crossing[] {
  const { cx, cy, rx, ry } = layout;
  const { bed, plaza } = parkPlan(layout);
  if (bed.w < 20 || bed.h < 20) return [];
  return [
    { x: plaza.x, y: cy - ry, traffic: 'h' },
    { x: plaza.x, y: cy + ry, traffic: 'h' },
    { x: cx - rx, y: plaza.y, traffic: 'v' },
    { x: cx + rx, y: plaza.y, traffic: 'v' },
  ];
}

/** A street as a rectangle of tarmac, kerb to kerb, and where it meets the ring road. */
export interface Street {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The junction's centre on the ring road. */
  jx: number;
  jy: number;
  /** Which way the street runs from the junction. */
  dir: Side;
}

/** A raised pavement block: a building's plot, a small green, or the park. */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'plot' | 'green' | 'park';
}

export interface TownPlan {
  blocks: Block[];
  streets: Street[];
}

interface Span {
  a: number;
  b: number;
  kind: 'plot' | 'green';
}

/**
 * The town as the concept draws it (art-direction §1): tarmac everywhere, and raised pavement blocks on it, so the
 * streets are what's left between them. Each building stands on a plot that runs from the ring road's kerb out to
 * the board's edge (or the skyline, or the street along the foot); plots close together share a block, and wide
 * leftovers at the ends of a row or column become small greens with a street before them. The ring's straights
 * carry on past its corners, and every gap between blocks is a side street meeting the ring. Decorative only: tokens
 * keep to the ring road.
 */
export function townPlan(layout: BoardLayout): TownPlan {
  const { cx, cy, rx, ry, road, cell, count, width, height, sky, foot } = layout;
  const L = cx - rx;
  const R = cx + rx;
  const T = cy - ry;
  const B = cy + ry;
  const gap = road * 2;
  const padX = cell * PLOT_PAD;
  const sides: Record<Side, Span[]> = { top: [], right: [], bottom: [], left: [] };
  for (let i = 0; i < count; i++) {
    const s = siteAt(layout, i);
    const box = buildingBox(layout, i);
    const across = s.side === 'top' || s.side === 'bottom';
    sides[s.side].push(
      across
        ? { a: box.l - padX, b: box.r + padX, kind: 'plot' }
        : { a: box.t + cell * 0.25 - PAVEMENT, b: box.b + PAVEMENT, kind: 'plot' },
    );
  }
  const blocks: Block[] = [];
  const streets: Street[] = [];
  // Along each side: where the side runs (lo..hi), and its blocks' depth (from..to) away from the ring.
  const run: Record<Side, { lo: number; hi: number; from: number; to: number }> = {
    top: { lo: 0, hi: width, from: sky, to: T - road },
    bottom: { lo: 0, hi: width, from: B + road, to: foot },
    left: { lo: T + road, hi: B - road, from: 0, to: L - road },
    right: { lo: T + road, hi: B - road, from: R + road, to: width },
  };
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const r = run[side];
    if (r.to - r.from < 4 || r.hi - r.lo < 4) continue;
    const spans = sides[side].sort((p, q) => p.a - q.a).map((p) => ({ ...p }));
    // The ends reach the run's edges, or leave a green and a street there.
    for (const p of spans) {
      p.a = Math.max(0, p.a);
      p.b = Math.min(side === 'top' || side === 'bottom' ? width : height, p.b);
    }
    // A column whose end building stands past the ring's corner (a tall board) runs on to meet the row's blocks.
    if (side === 'left' || side === 'right') {
      if ((spans[0]?.a ?? r.lo) < r.lo) r.lo = T - road;
      if ((spans[spans.length - 1]?.b ?? r.hi) > r.hi) r.hi = B + road;
    }
    const first = spans[0];
    const last = spans[spans.length - 1];
    if (first && last) {
      // A leftover too small to plant just widens the end plot.
      const room = gap + cell * 0.45;
      if (first.a - r.lo < room) first.a = r.lo;
      else spans.unshift({ a: r.lo, b: first.a - gap, kind: 'green' });
      if (r.hi - last.b < room) last.b = r.hi;
      else spans.push({ a: last.b + gap, b: r.hi, kind: 'green' });
    } else spans.push({ a: r.lo, b: r.hi, kind: 'green' });
    // Neighbours too close for a street between them share a block.
    const merged: Span[] = [];
    for (const p of spans) {
      const prev = merged[merged.length - 1];
      if (prev && p.a - prev.b < gap - 0.5) {
        prev.b = Math.max(prev.b, p.b);
        if (p.kind === 'plot') prev.kind = 'plot';
      } else merged.push(p);
    }
    const across = side === 'top' || side === 'bottom';
    for (const [k, p] of merged.entries()) {
      blocks.push(
        across
          ? { x: p.a, y: r.from, w: p.b - p.a, h: r.to - r.from, kind: p.kind }
          : { x: r.from, y: p.a, w: r.to - r.from, h: p.b - p.a, kind: p.kind },
      );
      const next = merged[k + 1];
      if (!next) continue;
      // The side street in the gap, from the ring out to the edge.
      const mid = (p.b + next.a) / 2;
      const a = p.b;
      const w = next.a - p.b;
      if (side === 'top') streets.push({ x: a, y: sky, w, h: T - sky, jx: mid, jy: T, dir: 'top' });
      if (side === 'bottom')
        streets.push({ x: a, y: B, w, h: height - B, jx: mid, jy: B, dir: 'bottom' });
      if (side === 'left') streets.push({ x: 0, y: a, w: L, h: w, jx: L, jy: mid, dir: 'left' });
      if (side === 'right')
        streets.push({ x: R, y: a, w: width - R, h: w, jx: R, jy: mid, dir: 'right' });
    }
  }
  // The ring's straights carry on past its corners, between the rows and the columns, where no block is in the way.
  const open = (s: Street) =>
    blocks.every(
      (b) =>
        b.x >= s.x + s.w || b.x + b.w <= s.x || b.y >= s.y + s.h - 0.5 || b.y + b.h <= s.y + 0.5,
    );
  for (const y of [T, B]) {
    const l: Street = { x: 0, y: y - road, w: L, h: gap, jx: L, jy: y, dir: 'left' };
    const r: Street = { x: R, y: y - road, w: width - R, h: gap, jx: R, jy: y, dir: 'right' };
    for (const s of [l, r]) if (s.w > gap && open(s)) streets.push(s);
  }
  blocks.push({ x: L + road, y: T + road, w: R - L - gap, h: B - T - gap, kind: 'park' });
  return { blocks: blocks.filter((b) => b.w > 2 && b.h > 2), streets };
}

/**
 * The board's corners that the DOM overlays cover on desktop (Game.tsx): the week sign at the top left and the menu
 * at the top right, in px with their 8px inset. Markers keep clear of them.
 */
export const CORNER_OVERLAYS = { sign: { w: 245, h: 96 }, menu: { w: 290, h: 46 } };

/**
 * Where a player's marker hovers once it has arrived: over the building's roofline, as the concept pins its player
 * (art-direction §4: a pointer toward the current building). `perch`, when given, is how far above the site the
 * building's art reaches: the marker's pointer rests on its roofline, clear of the name painted on its sign. Over the
 * top row that reaches into the skyline band, as the concept's pin does; it stays on the board and slides sideways
 * off the week sign and the menu (`CORNER_OVERLAYS`), or drops below them where the building has no room beside them.
 */
export function markerPoint(
  layout: BoardLayout,
  index: number,
  perch?: number,
): { x: number; y: number } {
  const { x, y, side } = siteAt(layout, index);
  const { token, sky, cell, width } = layout;
  if (perch !== undefined) {
    // The active marker's radius; its pointer reaches about 1.45 radii below its centre (Board.tsx).
    const r = token * 0.575;
    let m = { x, y: Math.max(r + 4, y - perch - r * 1.45) };
    const { sign, menu } = CORNER_OVERLAYS;
    const pad = 4;
    const over = (w: number, h: number, left: boolean) =>
      m.y - r < h && (left ? m.x - r < w : m.x + r > width - w);
    for (const [box, left] of [
      [sign, true],
      [menu, false],
    ] as const) {
      if (!over(box.w, box.h, left)) continue;
      // Beside the overlay, while still over the building; failing that, under it.
      const sx = left ? box.w + r + pad : width - box.w - r - pad;
      if (Math.abs(sx - x) <= cell * 0.45) m = { x: sx, y: m.y };
      else m = { x, y: box.h + r + pad };
    }
    return m;
  }
  // The top row's markers sit below the week sign in the skyline band's corner (Game.tsx).
  const clear = side === 'top' ? sky * 0.6 + token : token * 0.75;
  return { x, y: Math.max(clear, y - cell * TALL + token * 0.3) };
}

/** Where a building's feedback (floating numbers) appears: above the marker over its roof, in board pixels. */
export function feedbackPoint(layout: BoardLayout, index: number): { x: number; y: number } {
  const { x, y } = siteAt(layout, index);
  return { x, y: Math.max(layout.cell * 0.2, y - layout.cell * TALL - layout.token * 0.9) };
}
