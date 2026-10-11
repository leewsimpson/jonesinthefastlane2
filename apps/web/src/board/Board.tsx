/**
 * The Pixi board (art-direction §4, NFR-04): a code-drawn town block, a ring road round a landscaped square in a grid
 * of side streets, with a paved plot per location, the generated buildings on the plots (names painted on their
 * signs), and a token per player: a bust in a player-colour ring with the seat's shape. The town keeps its daylight
 * in both themes.
 * Tokens glide along the road to where the engine says they are (FR-02); reduced motion jumps instead. Pixi owns
 * only the canvas: a click on a building travels there at once, and the DOM travel dialog is the accessible way to
 * move (tech-stack §2).
 */
import type { GameState } from '@fastlane/engine';
// A strict CSP has no 'unsafe-eval' (ci-cd.md §5): this swaps Pixi's generated shader and uniform code for
// precompiled versions. It must load before Pixi creates a renderer.
import 'pixi.js/unsafe-eval';
import { Application, extend, useTick } from '@pixi/react';
import {
  Assets,
  Container,
  Graphics,
  ParticleContainer,
  Rectangle,
  Sprite,
  type Spritesheet,
  Texture,
} from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Moment } from '../fx/map.ts';
import { content } from '../game/engine.ts';
import { useReducedMotion } from '../settings/hooks.ts';
import { emotion, seatOf } from '../ui/common/stats.ts';
import { type Coin, spawn, step } from './coins.ts';
import { buildingFrame } from './frames.ts';
import {
  type BoardLayout,
  boardLayout,
  type Crossing,
  loopDelta,
  markerPoint,
  parkCrossings,
  parkPlan,
  pointAt,
  siteAt,
  stepToward,
  type TownPlan,
  townPlan,
} from './layout.ts';
import { type Prop, scenery } from './scenery.ts';

extend({ Container, Graphics, ParticleContainer, Sprite });

/** Palette (art-direction §2), with a few related shades for road, pavement and planting. */
const INK = 0x263c53;
const CREAM = 0xf9f3df;
const BUTTER = 0xf3dea0;
/** Warm grey asphalt, the concept's, a shade of slate (art-direction §2). */
const ROAD = 0x8c8784;
const PAVEMENT = 0xf0e4cc;
const KERB = 0xbfae93;
/** The ring road's centre dashes, butter as the concept paints its main street; side streets are dashed in cream. */
const CENTRE_LINE = 0xf0d27a;
const LEAF = 0x64865a;
/** The town square's lawn and paving, matched to the painted buildings' grass and paths. */
const PARK_LAWN = 0x93b43c;
/** The plots' lawns: the painted grass, a shade quieter so the storefronts lead. */
const GRASS = 0x8fae50;
const PARK_PATH = 0xe8d5b9;
const BRICK = 0xb75e49;
const FLOWER = 0xe48aa4;

/** Steps of the loop a token covers per second. */
const TOKEN_SPEED = 5;
/** The longest a token may take to arrive, in seconds. */
const MAX_TRIP_S = 1;
/** Spacing between tokens sharing a building, in token widths: clear of each other, the active one is bigger. */
const TOKEN_GAP = 1.2;

interface Sheets {
  locations: Spritesheet;
  busts: Spritesheet;
  /** The skyline backdrop; the board area's daylight gradient stands in if it fails. */
  skyline: Texture | null;
  /** Trees, lamps, the fountain, vehicles and passers-by; the town is bare without them. */
  street: Spritesheet | null;
}

let sheetsPromise: Promise<Sheets> | null = null;
function loadSheets(): Promise<Sheets> {
  sheetsPromise ??= Promise.all([
    Assets.load<Spritesheet>('/assets/atlases/locations.json'),
    Assets.load<Spritesheet>('/assets/atlases/busts.json'),
    Assets.load<Texture>('/assets/backgrounds/backdrop-day.webp').catch(() => null),
    Assets.load<Spritesheet>('/assets/atlases/street.json').catch(() => null),
  ]).then(([locations, busts, skyline, street]) => {
    smooth(locations);
    smooth(busts);
    if (street) smooth(street);
    return { locations, busts, skyline, street };
  });
  return sheetsPromise;
}

/**
 * The atlases are drawn at about half their size, which is jagged without mipmaps. Set before the first render, so
 * the texture is uploaded with its mip chain; it costs no download.
 */
function smooth(sheet: Spritesheet) {
  const source = sheet.textureSource;
  source.autoGenerateMipmaps = true;
  source.style.scaleMode = 'linear';
  source.style.mipmapFilter = 'linear';
}

/** A burst of the active player's coins and their mood for a moment (ENG-01), keyed so each plays once. */
export interface BoardFx {
  id: number;
  coins: number;
  moment: Moment | null;
}

/** How long a moment's face (proud, shocked) stays on the token, in ms. */
const MOMENT_FACE_MS = 2_200;

/** The face a moment puts on: good news is proud, bad news is shocked. */
export function momentFace(moment: Moment | null): string | null {
  if (!moment) return null;
  return moment.kind === 'laidOff' || moment.kind === 'letGo' || moment.kind === 'evicted'
    ? 'shocked'
    : 'proud';
}

/**
 * A zebra crossing (`Crossing`): stripes parallel to the traffic, side by side from kerb to kerb across a road
 * `half` wide each way of its centre, each `walk` long.
 */
function zebra(g: Graphics, c: Crossing, half: number, walk: number) {
  const span = half * 1.8;
  const stripe = Math.max(2, half * 0.17);
  const n = Math.max(2, Math.floor((span + stripe) / (stripe * 2)));
  const start = -((n * 2 - 1) * stripe) / 2;
  for (let k = 0; k < n; k++) {
    const d = start + k * stripe * 2;
    if (c.traffic === 'h') g.rect(c.x - walk / 2, c.y + d, walk, stripe);
    else g.rect(c.x + d, c.y - walk / 2, stripe, walk);
  }
  g.fill({ color: CREAM, alpha: 0.95 });
}

/**
 * The town's ground (art-direction §1, §4), as the concept draws it: tarmac everywhere below the skyline, and raised
 * pavement blocks on it (`townPlan`), so the streets are what's left between them. Lane dashes run down the ring and
 * every street, with zebra crossings where streets meet the ring. All code-drawn; the art stands on it.
 */
function Town({ layout, plan }: { layout: BoardLayout; plan: TownPlan }) {
  const draw = useCallback(
    (g: Graphics) => {
      const { road, count, cell, width, height, sky, foot } = layout;
      g.clear();
      g.rect(0, sky, width, height - sky).fill(ROAD);
      // Blocks: a darker kerb face below each, the pavement on top, a thin ink edge (art-direction §1).
      const r = Math.max(4, cell * 0.06);
      const lip = Math.max(2, cell * 0.015);
      for (const b of plan.blocks) g.roundRect(b.x, b.y + lip, b.w, b.h, r).fill(KERB);
      for (const b of plan.blocks)
        g.roundRect(b.x, b.y, b.w, b.h, r)
          .fill(PAVEMENT)
          .stroke({ color: INK, width: 1, alpha: 0.35 });
      // Lawns inside the pavement: greens all over, plots behind their buildings, keeping a paved forecourt along
      // the front edge where the doors and passers-by are.
      const inset = Math.max(5, cell * 0.05);
      const forecourt = cell * 0.13;
      for (const b of plan.blocks) {
        if (b.kind === 'park') continue;
        // A plot's lawn is a planted patch inside a wide paved margin, as the concept's blocks are mostly paved.
        const pad = b.kind === 'plot' ? inset * 2.2 : inset;
        const front = b.kind === 'plot' ? forecourt : inset;
        const h = b.h - pad - front;
        if (b.w > pad * 3 && h > pad)
          g.roundRect(b.x + pad, b.y + pad, b.w - pad * 2, h, r)
            .fill(GRASS)
            .stroke({ color: LEAF, width: 1.5 });
      }

      // Lane dashes: down the ring and each street, clear of the junctions; along the foot street.
      const near = (x: number, y: number, d: number) =>
        plan.streets.some((s) => Math.hypot(x - s.jx, y - s.jy) < d);
      const crossings = parkCrossings(layout);
      const dashes = 64;
      for (let i = 0; i < dashes; i++) {
        const a = pointAt(layout, (i / dashes) * count);
        const b = pointAt(layout, ((i + 0.4) / dashes) * count);
        if (near(a.x, a.y, road * 2.2) || near(b.x, b.y, road * 2.2)) continue;
        if (crossings.some((c) => Math.hypot(a.x - c.x, a.y - c.y) < road * 1.6)) continue;
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      g.stroke({ color: CENTRE_LINE, width: 2, alpha: 0.95 });
      const dash = cell * 0.09;
      for (const st of plan.streets) {
        const across = st.dir === 'left' || st.dir === 'right';
        const k = st.dir === 'left' || st.dir === 'top' ? -1 : 1;
        const long = across ? st.w : st.h;
        const mid = across ? st.y + st.h / 2 : st.x + st.w / 2;
        for (let d = road * 3.2; d < long - dash; d += dash * 2.2) {
          if (across) {
            const x = st.jx + k * d;
            g.moveTo(x, mid).lineTo(x + k * dash, mid);
          } else {
            const y = st.jy + k * d;
            if (y < sky || y > foot - road * 0.5) continue;
            g.moveTo(mid, y).lineTo(mid, y + k * dash);
          }
        }
      }
      if (foot < height)
        for (let x = dash; x < width; x += dash * 2.2) {
          const y = (foot + height) / 2;
          if (plan.streets.some((s) => x + dash > s.x && x < s.x + s.w && s.dir === 'bottom'))
            continue;
          g.moveTo(x, y).lineTo(x + dash, y);
        }
      g.stroke({ color: CREAM, width: 2, alpha: 0.9 });

      // Zebra crossings across each street's mouth, just off the ring, and where the park's paths meet the ring.
      const walk = road * 0.9;
      for (const st of plan.streets) {
        const across = st.dir === 'left' || st.dir === 'right';
        const k = st.dir === 'left' || st.dir === 'top' ? -1 : 1;
        const d = road * 1.6 + walk / 2;
        const half = (across ? st.h : st.w) / 2;
        const mid = across ? st.y + half : st.x + half;
        if (across) zebra(g, { x: st.jx + k * d, y: mid, traffic: 'h' }, half, walk);
        else zebra(g, { x: mid, y: st.jy + k * d, traffic: 'v' }, half, walk);
      }
      for (const c of crossings) zebra(g, c, road, walk);
    },
    [layout, plan],
  );
  return <pixiGraphics draw={draw} />;
}

/**
 * The skyline across the top of the board (art-direction §4: broad daylight skyline, quieter than the destinations):
 * the backdrop's towers, bridges and river, cropped to the band above the town.
 */
function Skyline({ layout, texture }: { layout: BoardLayout; texture: Texture }) {
  const { width, sky } = layout;
  const cropped = useMemo(() => {
    const k = width / texture.width;
    // The band ends at the near bank of the river, a little below the bridges.
    const bottom = texture.height * 0.47;
    const h = Math.min(bottom, (sky + 4) / k);
    const frame = new Rectangle(0, Math.max(0, bottom - h), texture.width, h);
    return { texture: new Texture({ source: texture.source, frame }), scale: k };
  }, [texture, width, sky]);
  useEffect(() => () => cropped.texture.destroy(false), [cropped]);
  if (sky < 8) return null;
  return <pixiSprite texture={cropped.texture} scale={cropped.scale} />;
}

/**
 * The town square inside the ring (art-direction §1, `parkPlan`): lawn inside the paved walk, two paths crossing it
 * edge to edge, and a round brick-edged plaza where they meet, ringed by flower beds. The fountain, lamps and trees
 * stand on it from the street atlas (`scenery.ts`). Decorative only: it is not a destination.
 */
function Park({ layout }: { layout: BoardLayout }) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const { bed, path, plaza } = parkPlan(layout);
      if (bed.w < 20 || bed.h < 20) return;
      g.roundRect(bed.x, bed.y, bed.w, bed.h, Math.min(bed.w, bed.h) * 0.06)
        .fill(PARK_LAWN)
        .stroke({ color: LEAF, width: 1.5 });
      // The paths, edge to edge through the plaza.
      g.rect(bed.x - 1, plaza.y - path / 2, bed.w + 2, path);
      g.rect(plaza.x - path / 2, bed.y - 1, path, bed.h + 2);
      g.fill(PARK_PATH);
      g.moveTo(bed.x, plaza.y - path / 2).lineTo(bed.x + bed.w, plaza.y - path / 2);
      g.moveTo(bed.x, plaza.y + path / 2).lineTo(bed.x + bed.w, plaza.y + path / 2);
      g.moveTo(plaza.x - path / 2, bed.y).lineTo(plaza.x - path / 2, bed.y + bed.h);
      g.moveTo(plaza.x + path / 2, bed.y).lineTo(plaza.x + path / 2, bed.y + bed.h);
      g.stroke({ color: KERB, width: 1, alpha: 0.8 });
      // Flower beds round the plaza, in the lawns' inner corners.
      const bedR = Math.max(4, plaza.rx * 0.36);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const bx = plaza.x + dx * (plaza.rx * 0.78 + path * 0.5);
        const by = plaza.y + dy * (plaza.ry * 0.78 + path * 0.5);
        g.ellipse(bx, by, bedR * 1.5, bedR * 0.85)
          .fill(LEAF)
          .stroke({ color: INK, width: 0.75, alpha: 0.45 });
        for (let k = 0; k < 18; k++) {
          const t = k * 2.4;
          const d = 0.15 + (k % 4) * 0.24;
          g.circle(
            bx + Math.cos(t) * bedR * 1.2 * d,
            by + Math.sin(t) * bedR * 0.62 * d,
            bedR * 0.17,
          ).fill([BUTTER, FLOWER, CREAM][k % 3] ?? BUTTER);
        }
      }
      // The plaza: paving with a brick edge.
      g.ellipse(plaza.x, plaza.y, plaza.rx, plaza.ry)
        .fill(PARK_PATH)
        .stroke({ color: BRICK, width: Math.max(2, path * 0.22), alpha: 0.85 });
      g.ellipse(plaza.x, plaza.y, plaza.rx * 0.86, plaza.ry * 0.86).stroke({
        color: KERB,
        width: 1,
        alpha: 0.7,
      });
    },
    [layout],
  );
  return <pixiGraphics draw={draw} />;
}

/** Scenery and street life from the street atlas (`scenery.ts`), nearest last. Decorative and not clickable. */
function Props({ props, sheet }: { props: Prop[]; sheet: Spritesheet }) {
  return (
    <>
      {[...props]
        .sort((a, b) => a.y - b.y)
        .map((p) => {
          const texture = sheet.textures[p.frame];
          if (!texture) return null;
          const k = p.h / texture.height;
          return (
            <pixiSprite
              key={`${p.frame}:${Math.round(p.x)}:${Math.round(p.y)}`}
              texture={texture}
              anchor={{ x: 0.5, y: 1 }}
              x={p.x}
              y={p.y}
              scale={{ x: p.flip ? -k : k, y: k }}
            />
          );
        })}
    </>
  );
}

function Pad({
  layout,
  index,
  here,
  texture,
  onSelect,
  onHover,
}: {
  layout: BoardLayout;
  index: number;
  here: boolean;
  texture: Texture | undefined;
  onSelect(): void;
  onHover(on: boolean): void;
}) {
  const { x, y } = siteAt(layout, index);
  const { cell } = layout;
  // The building's ground shadow, cast down-right by the upper-left light (art-direction §5: code supplies ground
  // shadows). Where the player stands, a butter forecourt with an ink outline (art-direction §2).
  const drawPad = useCallback(
    (g: Graphics) => {
      g.clear();
      if (here)
        g.roundRect(-cell * 0.52, -cell * 0.1, cell * 1.04, cell * 0.16, 4)
          .fill(BUTTER)
          .stroke({ color: INK, width: 2 });
      g.ellipse(cell * 0.05, cell * 0.01, cell * 0.5, cell * 0.06).fill({
        color: INK,
        alpha: 0.16,
      });
    },
    [cell, here],
  );
  const scale = texture ? cell / texture.width : 1;
  return (
    <pixiContainer
      x={x}
      y={y}
      eventMode="static"
      cursor={here ? 'default' : 'pointer'}
      onPointerTap={onSelect}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
    >
      <pixiGraphics draw={drawPad} />
      {texture && (
        <pixiSprite texture={texture} anchor={{ x: 0.5, y: 1 }} y={cell * 0.03} scale={scale} />
      )}
    </pixiContainer>
  );
}

function Token({
  layout,
  target,
  perch,
  offset,
  colour,
  texture,
  active,
  reduced,
}: {
  layout: BoardLayout;
  target: number;
  /** How tall the target building stands above its site, for the marker to rest on (`markerPoint`). */
  perch: number | undefined;
  /** Sideways shift when tokens share a stop. */
  offset: number;
  colour: string;
  texture: Texture | undefined;
  active: boolean;
  reduced: boolean;
}) {
  const ref = useRef<Container>(null);
  const pointer = useRef<Graphics>(null);
  const mask = useRef<Graphics>(null);
  const sprite = useRef<Sprite>(null);
  const pos = useRef(target);
  /** Paper-puppet motion (art-direction §4): seconds alive for the idle bob, and the squash and pop timers. */
  const clock = useRef(offset);
  const squash = useRef(0);
  const pop = useRef(0);
  const size = layout.token * (active ? 1.15 : 1);

  // A new face pops in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the face changes
  useEffect(() => {
    pop.current = 1;
  }, [texture]);

  const place = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const p = pointAt(layout, pos.current);
    const bob = reduced || !active ? 0 : Math.sin(clock.current * 3) * layout.token * 0.04;
    // Tokens travel along the road; nearing the stop they lift over the building's roof and hover there, side by side
    // when they share it.
    const left = Math.abs(loopDelta(pos.current, target, layout.count));
    const f = Math.max(0, Math.min(1, 1 - left / 0.6));
    const lift = f * f * (3 - 2 * f);
    const m = markerPoint(layout, target, perch);
    c.x = p.x + (m.x + offset - p.x) * lift;
    c.y = p.y + (m.y - p.y) * lift + bob;
    // The pointer turns toward the building the token is at or heading for (art-direction §4).
    const site = siteAt(layout, target);
    if (pointer.current)
      pointer.current.rotation =
        Math.atan2(site.y - layout.cell * 0.45 - c.y, site.x - c.x) + Math.PI / 2;
    const sq = Math.sin(squash.current * Math.PI) * 0.18;
    const pp = 1 + Math.sin(pop.current * Math.PI) * 0.15;
    c.scale.set((1 + sq) * pp, (1 - sq) * pp);
  }, [layout, offset, reduced, active, target, perch]);

  useTick(
    useCallback(
      (ticker: { deltaMS: number }) => {
        const dt = ticker.deltaMS / 1000;
        clock.current += dt;
        if (reduced) {
          pos.current = target;
          squash.current = 0;
          pop.current = 0;
        } else {
          const moving = pos.current !== target;
          // A long trip (the walk home at week's end) is caught up in about a second, so the token isn't still
          // in transit when the header already says where the player is.
          const left = Math.abs(loopDelta(pos.current, target, layout.count));
          const speed = Math.max(TOKEN_SPEED, left / MAX_TRIP_S);
          pos.current = stepToward(pos.current, target, speed * dt, layout.count);
          // Squash on arrival: a quick down-and-up as the token lands.
          if (moving && pos.current === target) squash.current = 1;
          squash.current = Math.max(0, squash.current - dt * 3.5);
          pop.current = Math.max(0, pop.current - dt * 3);
        }
        place();
      },
      [reduced, target, layout.count, place],
    ),
  );

  useEffect(() => {
    if (sprite.current && mask.current) sprite.current.mask = mask.current;
  });

  const drawPointer = useCallback(
    (g: Graphics) => {
      g.clear();
      const r = size / 2;
      g.poly([-r * 0.36, -r * 0.78, r * 0.36, -r * 0.78, 0, -r - r * 0.42])
        .fill(colour)
        .stroke({ color: INK, width: 1.5, join: 'round' });
    },
    [size, colour],
  );
  const drawRing = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, size / 2 + 2).fill(INK);
      g.circle(0, 0, size / 2).fill(colour);
      g.circle(0, 0, size / 2 - 4).fill(CREAM);
    },
    [size, colour],
  );
  const drawMask = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, size / 2 - 4).fill(0xffffff);
    },
    [size],
  );
  const scale = texture ? (size * 1.05) / texture.height : 1;
  return (
    <pixiContainer ref={ref}>
      <pixiGraphics ref={pointer} draw={drawPointer} />
      <pixiGraphics draw={drawRing} />
      <pixiGraphics ref={mask} draw={drawMask} />
      {texture && (
        <pixiSprite ref={sprite} texture={texture} anchor={{ x: 0.5, y: 0.42 }} scale={scale} />
      )}
    </pixiContainer>
  );
}

/** Coins that burst from a point and fall away (ENG-01), on a `ParticleContainer`. */
function Coins({ burst, x, y, scale }: { burst: BoardFx; x: number; y: number; scale: number }) {
  const ref = useRef<ParticleContainer>(null);
  const coins = useRef<Coin[]>([]);
  const played = useRef(burst.id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a burst plays once per id, from where the token is now
  useEffect(() => {
    const c = ref.current;
    if (!c || burst.id === played.current || burst.coins === 0) return;
    played.current = burst.id;
    const fresh = spawn(burst.coins, x, y, scale);
    for (const coin of fresh) c.addParticle(coin.p);
    coins.current.push(...fresh);
  }, [burst.id]);
  useTick(
    useCallback((ticker: { deltaMS: number }) => {
      const c = ref.current;
      if (!c || coins.current.length === 0) return;
      const { alive, dead } = step(coins.current, ticker.deltaMS / 1000);
      for (const d of dead) c.removeParticle(d.p);
      coins.current = alive;
    }, []),
  );
  return (
    <pixiParticleContainer
      ref={ref}
      dynamicProperties={{
        position: true,
        color: true,
        rotation: false,
        vertex: false,
        uvs: false,
      }}
    />
  );
}

/**
 * The scene measures its own container: `<Application>` renders the children it was given before its async init
 * finished, so a size passed down as a prop would stay at its first value.
 */
function Scene({
  container,
  state,
  active,
  fx,
  onSelect,
  onHover,
}: {
  container: React.RefObject<HTMLDivElement | null>;
  state: GameState;
  active: string | null;
  fx: BoardFx;
  onSelect(location: string): void;
  onHover(location: string | null): void;
}) {
  const reduced = useReducedMotion();
  // A moment's face shows for a while, then the token goes back to its mood.
  const [face, setFace] = useState<string | null>(null);
  useEffect(() => {
    const f = momentFace(fx.moment);
    setFace(f);
    if (!f) return;
    const id = setTimeout(() => setFace(null), MOMENT_FACE_MS);
    return () => clearTimeout(id);
  }, [fx.moment]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    // Mounting the canvas can report 0 × 0 for a moment; keep the last real size.
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0)
        setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [container]);
  const [sheets, setSheets] = useState<Sheets | null>(null);

  useEffect(() => {
    let live = true;
    loadSheets()
      .then((s) => live && setSheets(s))
      .catch((e: unknown) => console.error('board art failed to load', e));
    return () => {
      live = false;
    };
  }, []);

  const locations = content.city.board.locations.map((l) => l.id);
  const layout = useMemo(
    () => boardLayout(size.w, size.h, locations.length),
    [size, locations.length],
  );
  const plan = useMemo(() => townPlan(layout), [layout]);
  const props = useMemo(() => {
    const all = scenery(layout, plan);
    return {
      back: all.filter((p) => p.layer === 'back'),
      front: all.filter((p) => p.layer === 'front'),
    };
  }, [layout, plan]);
  if (size.w === 0) return null;
  const street = sheets?.street;

  const me = state.players.find((p) => p.id === active) ?? state.players[0];
  const frameFor = (id: string) => buildingFrame(id, me?.housing.tier);

  // Draw the far side of the loop first, so nearer buildings overlap it.
  const order = locations
    .map((id, index) => ({ id, index, y: siteAt(layout, index).y }))
    .sort((a, b) => a.y - b.y);

  const byLocation = new Map<string, string[]>();
  for (const p of state.players)
    byLocation.set(p.location, [...(byLocation.get(p.location) ?? []), p.id]);

  // Markers rest on the roofline, clear of the name painted on the building's sign.
  const perchOf = (id: string) =>
    artHeight(sheets?.locations.textures[frameFor(id)], layout.cell) - layout.cell * 0.03;
  const meIndex = me ? Math.max(0, locations.indexOf(me.location)) : 0;
  const mePoint = markerPoint(layout, meIndex, me && perchOf(me.location));

  return (
    <pixiContainer>
      <pixiContainer>
        {sheets?.skyline && <Skyline layout={layout} texture={sheets.skyline} />}
        <Town layout={layout} plan={plan} />
        <Park layout={layout} />
        {street && <Props props={props.back} sheet={street} />}
        {order.map(({ id, index }) => (
          <Pad
            key={id}
            layout={layout}
            index={index}
            here={me?.location === id}
            texture={sheets?.locations.textures[frameFor(id)]}
            onSelect={() => onSelect(id)}
            onHover={(on) => onHover(on ? id : null)}
          />
        ))}
        {street && <Props props={props.front} sheet={street} />}
        {state.players
          .filter((p) => p.id !== active)
          .concat(state.players.filter((p) => p.id === active))
          .map((p) => {
            const index = locations.indexOf(p.location);
            const here = byLocation.get(p.location) ?? [];
            const k = here.indexOf(p.id);
            const offset = (k - (here.length - 1) / 2) * layout.token * TOKEN_GAP;
            const seat = seatOf(state.players, p.id);
            return (
              <Token
                key={p.id}
                layout={layout}
                target={Math.max(0, index)}
                perch={perchOf(p.location)}
                offset={offset}
                colour={seat.colour}
                texture={
                  sheets?.busts.textures[
                    `${seat.avatar}/${(p.id === active && face) || emotion(p.stats)}`
                  ]
                }
                active={p.id === active}
                reduced={reduced}
              />
            );
          })}
      </pixiContainer>
      {!reduced && (
        <Coins
          burst={fx}
          x={mePoint.x}
          y={mePoint.y - layout.token * 0.5}
          scale={Math.max(0.6, layout.token / 64)}
        />
      )}
    </pixiContainer>
  );
}

/** A building's drawn height at the board's building width. */
function artHeight(texture: Texture | undefined, cell: number): number {
  return texture ? (cell / texture.width) * texture.height : cell * 0.9;
}

const NO_BOARD_FX: BoardFx = { id: 0, coins: 0, moment: null };

export default function Board({
  state,
  active,
  fx = NO_BOARD_FX,
  onSelect,
  onHover = () => {},
}: {
  state: GameState;
  active: string | null;
  fx?: BoardFx;
  onSelect(location: string): void;
  onHover?(location: string | null): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true">
      <Application
        resizeTo={ref}
        backgroundAlpha={0}
        antialias
        autoDensity
        resolution={Math.min(2, window.devicePixelRatio || 1)}
      >
        <Scene
          container={ref}
          state={state}
          active={active}
          fx={fx}
          onSelect={onSelect}
          onHover={onHover}
        />
      </Application>
    </div>
  );
}
