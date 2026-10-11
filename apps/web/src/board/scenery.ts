/**
 * The town's scenery and street life (art-direction §1, §9): trees, lamps, vehicles and passers-by placed on the
 * code-drawn town (`townPlan`). Pure placement, so it is tested without Pixi; `Board.tsx` draws each prop from the
 * street atlas. Decorative only: nothing here is clickable, and nothing stands on a stop or in front of a storefront.
 */
import {
  type BoardLayout,
  buildingBox,
  parkBed,
  parkCrossings,
  parkPlan,
  pointAt,
  type Side,
  type TownPlan,
} from './layout.ts';

export interface Prop {
  /** The street-atlas frame. */
  frame: string;
  /** Where it stands: the bottom centre of its art. */
  x: number;
  y: number;
  /** Drawn height in px. */
  h: number;
  /** Mirrored: a vehicle driving left, or a tree drawn the other way round for variety. */
  flip: boolean;
  /** Behind the buildings (drawn before them) or in front. */
  layer: 'back' | 'front';
}

/** A steady pseudo-random number in [0, 1) for a position, so the town doesn't shuffle between renders. */
export function jitter(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const TREES = ['tree-round', 'tree-tall', 'tree-pair', 'tree-round'] as const;
/** The fountain art's height over its width (art/src/street/fountain.png). */
const FOUNTAIN_ASPECT = 0.89;
const PEOPLE = [
  'person-dog',
  'person-pair',
  'person-backpack',
  'person-family',
  'person-cyclist',
  'person-group',
] as const;
/**
 * Each vehicle's length in road half-widths (a lane is one), and its art's height-to-width ratio. Sized against the
 * buildings as the concept draws them: a sedan about a third of a storefront long, the bus about 1.7 sedans. The
 * side-on art is a level profile facing right, so it runs parallel to the road; `car-front` drives toward the viewer,
 * so its length is its width across the lane.
 */
const VEHICLES: Record<string, { length: number; aspect: number }> = {
  'car-taxi': { length: 2.8, aspect: 223 / 447 },
  'car-sedan': { length: 3.1, aspect: 201 / 525 },
  'car-hatch': { length: 2.6, aspect: 210 / 401 },
  'car-pickup': { length: 3, aspect: 195 / 428 },
  'van-delivery': { length: 3, aspect: 225 / 432 },
  bus: { length: 5.2, aspect: 260 / 621 },
  'car-front': { length: 1.5, aspect: 346 / 272 },
};

/**
 * Trees: each block is planted on a loose grid wherever a canopy clears the storefronts, behind a building (so
 * canopies show round its roofline), at its sides, and on its front corners. Greens are planted through.
 */
function trees(layout: BoardLayout, plan: TownPlan): Prop[] {
  const { cell, sky } = layout;
  const out: Prop[] = [];
  const boxes = Array.from({ length: layout.count }, (_, i) => buildingBox(layout, i));
  const step = cell * 0.26;
  for (const b of plan.blocks) {
    if (b.kind === 'park') continue;
    const placed: { x: number; y: number; size: number }[] = [];
    for (let y = b.y + step * 0.9; y <= b.y + b.h - 2; y += step * 0.75)
      for (let x = b.x + step * 0.4; x <= b.x + b.w - step * 0.4; x += step * 0.8) {
        const j = jitter(x, y);
        const px = x + (j - 0.5) * step * 0.5;
        const size = 0.3 + j * 0.24;
        // Canopies may overlap the skyline a little, as the concept's do, but not stand in it. Elsewhere a canopy only
        // just overhangs its block, so it never hides the road (and the traffic) beyond.
        if (y - cell * size < sky - cell * 0.35) continue;
        if (b.y > sky + 1 && y - cell * size * 0.9 < b.y - cell * 0.08) continue;
        if (
          placed.some((q) => Math.hypot(q.x - px, (q.y - y) * 1.3) < cell * (q.size + size) * 0.45)
        )
          continue;
        let layer: Prop['layer'] | null = 'front';
        for (const box of boxes) {
          const h = box.b - box.t;
          const inX = px > box.l + cell * 0.12 && px < box.r - cell * 0.12;
          const nearX = px > box.l - cell * 0.12 && px < box.r + cell * 0.12;
          if (y <= box.t || y >= box.b + cell * 0.2 || !nearX) continue;
          // Wholly hidden behind the roof: not worth a sprite. In front of a storefront: never.
          if (y < box.t + h * 0.5) layer = inX && y - cell * size * 0.9 > box.t ? null : 'back';
          else if (inX) layer = null;
          // A canopy in front never reaches over the upper facade, where the name is painted.
          const half = cell * size * 0.42;
          if (
            layer === 'front' &&
            px + half > box.l + cell * 0.04 &&
            px - half < box.r - cell * 0.04 &&
            y - cell * size < box.t + h * 0.6
          )
            layer = null;
          if (!layer) break;
        }
        if (!layer) continue;
        placed.push({ x: px, y, size });
        const frame = TREES[Math.floor(jitter(y, px) * TREES.length)] ?? 'tree-round';
        out.push({ frame, x: px, y, h: cell * size, flip: jitter(px, px) < 0.5, layer });
      }
  }
  return out;
}

/**
 * The town square's planting and centrepiece (`parkPlan`): the fountain on its plaza, lamps either side of it on the
 * paths, and trees loosely scattered over the four lawns, varied in size, kept off the paths and the plaza.
 */
function parkProps(layout: BoardLayout): Prop[] {
  const { bed, path, plaza } = parkPlan(layout);
  const { cell } = layout;
  if (bed.w < 20 || bed.h < 20) return [];
  const out: Prop[] = [];
  // The fountain stands at the plaza's middle, its basin filling most of it.
  const fh = plaza.rx * 1.5 * FOUNTAIN_ASPECT;
  // Its basin's middle sits about 0.3 of its height above its base.
  out.push({
    frame: 'fountain',
    x: plaza.x,
    y: plaza.y + fh * 0.3,
    h: fh,
    flip: false,
    layer: 'back',
  });
  const lamp = cell * 0.3;
  for (const dx of [-1, 1])
    out.push({
      frame: 'lamp',
      x: plaza.x + dx * (plaza.rx + path * 0.9),
      y: plaza.y - path * 0.7,
      h: lamp,
      flip: false,
      layer: 'back',
    });
  const clear = (x: number, y: number, size: number) => {
    const half = size * 0.42;
    // The trunk stands off the paving; in the three-quarter view a canopy may overhang a path behind it, but never
    // the fountain, and a trunk keeps a step back from the plaza's edge.
    if (Math.abs(x - plaza.x) < path / 2 + size * 0.12) return false;
    if (Math.abs(y - plaza.y) < path / 2 + size * 0.06) return false;
    const dx = (x - plaza.x) / (plaza.rx + half);
    const top = (y - size - plaza.y) / (plaza.ry * 2.2);
    const base = (y - plaza.y) / (plaza.ry + size * 0.15);
    return dx * dx + Math.min(top * top, base * base) > 1 && dx * dx + base * base > 1;
  };
  const step = cell * 0.26;
  const cols = Math.max(1, Math.round(bed.w / step));
  const rows = Math.max(1, Math.round(bed.h / (step * 0.8)));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const j = jitter(bed.x + c * 31, bed.y + r * 17);
      // A gap here and there, so the lawn shows through.
      if (j < 0.35) continue;
      const x = bed.x + (bed.w * (c + 0.5)) / cols + (j - 0.5) * step * 0.5;
      const y = Math.min(
        bed.y + bed.h - 2,
        bed.y + (bed.h * (r + 0.85)) / rows + (jitter(x, r) - 0.5) * step * 0.3,
      );
      const size = cell * (0.17 + j * 0.13);
      if (y - size * 0.9 < bed.y - cell * 0.1 || !clear(x, y, size)) continue;
      out.push({
        frame: TREES[Math.floor(jitter(y, x) * TREES.length)] ?? 'tree-round',
        x,
        y,
        h: size,
        flip: j < 0.6,
        layer: 'back',
      });
    }
  return out;
}

/** Lamps on the walk round the park, at its corners, as the concept lights its square. */
function lamps(layout: BoardLayout, plan: TownPlan): Prop[] {
  const park = plan.blocks.find((b) => b.kind === 'park');
  if (!park) return [];
  const bed = parkBed(layout);
  const h = layout.cell * 0.36;
  const walk = (bed.x - park.x) / 2;
  const corners: [number, number][] = [
    [park.x + walk, bed.y + walk * 0.5],
    [park.x + park.w - walk, bed.y + walk * 0.5],
    [park.x + walk, park.y + park.h - walk * 0.4],
    [park.x + park.w - walk, park.y + park.h - walk * 0.4],
  ];
  return corners.map(([x, y]) => ({ frame: 'lamp', x, y, h, flip: false, layer: 'front' }));
}

/** Offsets along a road, nearest first, to try when a vehicle's spot is taken. */
const SHIFTS = [
  0,
  ...Array.from({ length: 18 }, (_, i) => (i % 2 ? -1 : 1) * 0.025 * (Math.floor(i / 2) + 1)),
];

/** A road vehicles drive along: its centre line from end to end, and which way its traffic runs. */
interface Carriageway {
  traffic: 'h' | 'v';
  /** The centre line's fixed coordinate (y for a horizontal road). */
  at: number;
  /** Where it runs, along the other axis. */
  from: number;
  to: number;
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

const overlaps = (p: Box, q: Box) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;

/** A road's tarmac, kerb to kerb, widened by `pad` along it. */
function tarmac(w: Carriageway, road: number, pad = 0): Box {
  return w.traffic === 'h'
    ? { l: w.from - pad, r: w.to + pad, t: w.at - road, b: w.at + road }
    : { l: w.at - road, r: w.at + road, t: w.from - pad, b: w.to + pad };
}

/**
 * Traffic (art-direction §1: cars on the streets): side-on cars on the horizontal roads, keeping right (the near
 * lane heading right, the far lane left), and head-on cars coming down the vertical ones in the lane on the
 * viewer's left. Every vehicle stays in its lane, clear of junctions and their crossings, the stops where tokens
 * stand, and the other vehicles.
 */
function vehicles(layout: BoardLayout, plan: TownPlan): Prop[] {
  const { cx, cy, rx, ry, road, width, height, foot, count, token, sky } = layout;
  const L = cx - rx;
  const R = cx + rx;
  const T = cy - ry;
  const B = cy + ry;
  const across = (d: Side) => d === 'left' || d === 'right';
  const ring: Carriageway[] = [
    { traffic: 'h', at: T, from: L, to: R },
    { traffic: 'h', at: B, from: L, to: R },
    { traffic: 'v', at: L, from: T, to: B },
    { traffic: 'v', at: R, from: T, to: B },
  ];
  const streets = plan.streets.map(
    (s): Carriageway =>
      across(s.dir)
        ? { traffic: 'h', at: s.y + s.h / 2, from: s.x, to: s.x + s.w }
        : {
            traffic: 'v',
            at: s.x + s.w / 2,
            from: Math.max(s.y, sky),
            to: Math.min(s.y + s.h, foot),
          },
  );
  const footWay: Carriageway | null =
    foot < height ? { traffic: 'h', at: (foot + height) / 2, from: 0, to: width } : null;
  const ways = [...ring, ...streets, ...(footWay ? [footWay] : [])];
  // Keep clear of every road crossing a vehicle's own, with room for the zebra beside the junction, and of the
  // park's crossings and the stops.
  const zebra = road * 2.6;
  const crossings: Box[] = parkCrossings(layout).map((c) => ({
    l: c.x - road * 1.2,
    r: c.x + road * 1.2,
    t: c.y - road * 1.2,
    b: c.y + road * 1.2,
  }));
  const stops: Box[] = Array.from({ length: count }, (_, i) => {
    const p = pointAt(layout, i);
    return {
      l: p.x - token * 0.6,
      r: p.x + token * 0.6,
      t: p.y - token * 0.6,
      b: p.y + token * 0.6,
    };
  });
  const taken: Box[] = [];
  const out: Prop[] = [];
  /** Put `frame` on `way` near `t` (0..1 along it), heading right or down when `forward`; skipped if no room. */
  const place = (way: Carriageway, frame: string, t: number, forward: boolean) => {
    const v = VEHICLES[frame];
    if (!v) return;
    const len = road * v.length;
    const h = len * v.aspect;
    const others = ways
      .filter((w) => w.traffic !== way.traffic)
      .map((w) => {
        const k = tarmac(w, road);
        // The crossing road's tarmac, plus its zebras either side of the junction.
        return way.traffic === 'h'
          ? { ...k, l: k.l - zebra + road, r: k.r + zebra - road }
          : { ...k, t: k.t - zebra + road, b: k.b + zebra - road };
      });
    const span = way.to - way.from;
    // Nearest free spot to `t`, searched outward in small steps.
    for (const shift of SHIFTS) {
      const c = way.from + span * (t + shift);
      let box: Box;
      let prop: Prop;
      if (way.traffic === 'h') {
        // Wheels near the lane's lower edge; the level profile rises over it, as the board's elevated view sees it.
        const bottom = way.at + (forward ? road * 0.92 : road * 0.08);
        // It claims the lane it drives in; the body rising over the lane above stays free to overlap.
        // The far lane's claim stops at the centre line, so side streets joining from the near side don't block it.
        box = {
          l: c - len / 2,
          r: c + len / 2,
          t: bottom - road * 0.8,
          b: forward ? bottom : Math.min(bottom, way.at - 0.5),
        };
        prop = { frame, x: c, y: bottom, h, flip: !forward, layer: 'front' };
      } else {
        const x = way.at - road * 0.5;
        box = { l: x - len / 2, r: x + len / 2, t: c - h / 2, b: c + h / 2 };
        prop = { frame, x, y: c + h / 2, h, flip: false, layer: 'front' };
      }
      const [a, b] = way.traffic === 'h' ? [box.l, box.r] : [box.t, box.b];
      if (a < way.from || b > way.to) continue;
      const blocked = [...others, ...crossings, ...stops, ...taken].some((k) => overlaps(k, box));
      if (blocked) continue;
      taken.push(
        way.traffic === 'h'
          ? { ...box, l: box.l - road, r: box.r + road }
          : { ...box, t: box.t - road, b: box.b + road },
      );
      out.push(prop);
      return;
    }
  };
  const [top, bottom, left, right] = ring as [Carriageway, Carriageway, Carriageway, Carriageway];
  place(top, 'car-taxi', 0.3, true);
  place(top, 'car-sedan', 0.75, false);
  // The bottom ring's near lane is all junctions and stops; its traffic keeps to the far lane.
  place(bottom, 'van-delivery', 0.62, false);
  place(bottom, 'car-hatch', 0.22, false);
  place(left, 'car-front', 0.6, true);
  place(right, 'car-front', 0.3, true);
  if (footWay) {
    place(footWay, 'bus', 0.28, true);
    place(footWay, 'car-pickup', 0.8, false);
    place(footWay, 'car-taxi', 0.55, false);
  }
  // A vehicle on every other side street.
  for (const [i, w] of streets.entries()) {
    if (i % 2 === 1) continue;
    if (w.traffic === 'h') place(w, i % 4 === 0 ? 'car-hatch' : 'car-pickup', 0.5, i % 4 === 0);
    else place(w, 'car-front', 0.5, true);
  }
  return out;
}

/**
 * Passers-by on the pavement in front of each building, off its door, and a few at the park's edge. They are small,
 * so the storefronts stay readable.
 */
function people(layout: BoardLayout, plan: TownPlan): Prop[] {
  const { cell } = layout;
  const out: Prop[] = [];
  const h = cell * 0.16;
  let k = 0;
  const next = () => PEOPLE[k++ % PEOPLE.length] ?? 'person-pair';
  for (let i = 0; i < layout.count; i++) {
    const box = buildingBox(layout, i);
    const mid = (box.l + box.r) / 2;
    const block = plan.blocks.find(
      (b) => b.kind === 'plot' && mid >= b.x && mid <= b.x + b.w && box.b >= b.y,
    );
    // Only where the pavement in front has room for feet.
    if (!block || block.y + block.h - box.b < 3) continue;
    const w = box.r - box.l;
    // Either side of the door, and one more by a corner.
    const y = Math.min(block.y + block.h - 1, box.b + h * 0.15);
    for (const t of [0.14, 0.3, 0.78]) {
      if (jitter(i * 7 + t, w) < 0.3) continue;
      out.push({
        frame: next(),
        x: box.l + w * t,
        y,
        h,
        flip: jitter(w, i + t) < 0.5,
        layer: 'front',
      });
    }
  }
  // Walkers along the pavements beside the ring road, clear of the stops.
  const stops = Array.from({ length: layout.count }, (_, i) => pointAt(layout, i));
  const { cx, cy, rx, ry, road } = layout;
  const edge = road + 4;
  const walk = (x: number, y: number) => {
    if (stops.some((s) => Math.hypot(s.x - x, s.y - y) < layout.token * 1.2)) return;
    if (plan.streets.some((s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h)) return;
    out.push({ frame: next(), x, y, h, flip: jitter(x, y) < 0.5, layer: 'front' });
  };
  for (let t = 0.08; t < 1; t += 0.14) {
    walk(cx - rx + 2 * rx * t, cy - ry - edge);
    walk(cx - rx + 2 * rx * (t + 0.05), cy + ry + edge + h * 0.9);
  }
  // A few on the square's paths, and strolling round its walk.
  const sq = parkPlan(layout);
  if (sq.bed.w > 20 && sq.bed.h > 20)
    for (const [dx, dy] of [
      [-0.62, 0],
      [0.45, 0],
      [0, 0.75],
    ] as const)
      out.push({
        frame: next(),
        x: sq.plaza.x + (sq.bed.w / 2) * dx,
        y: sq.plaza.y + (sq.bed.h / 2) * dy + h * 0.35,
        h,
        flip: dx > 0,
        layer: 'front',
      });
  const park = plan.blocks.find((b) => b.kind === 'park');
  if (park) {
    const bed = parkBed(layout);
    for (const [t, top] of [
      [0.2, true],
      [0.83, true],
      [0.38, false],
    ] as const)
      out.push({
        frame: next(),
        x: park.x + park.w * t,
        y: top ? bed.y - 1 : park.y + park.h - 1,
        h,
        flip: t > 0.5,
        layer: 'front',
      });
  }
  return out;
}

export function scenery(layout: BoardLayout, plan: TownPlan): Prop[] {
  return [
    ...trees(layout, plan),
    ...parkProps(layout),
    ...lamps(layout, plan),
    ...vehicles(layout, plan),
    ...people(layout, plan),
  ];
}
