/**
 * The Pixi board (art-direction §4, NFR-04): a code-drawn ring road with location pads from the palette, the
 * generated buildings on the pads, and a token per player: a bust in a player-colour ring with the seat's shape.
 * Tokens glide along the road to where the engine says they are (FR-02); reduced motion jumps instead. Pixi owns
 * only the canvas: a click on a building travels there at once, and the DOM travel dialog is the accessible way to
 * move (tech-stack §2).
 */
import type { GameState } from '@fastlane/engine';
import { Application, extend, useTick } from '@pixi/react';
import {
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  ParticleContainer,
  Sprite,
  type Spritesheet,
  Text,
  type TextStyleOptions,
  type Texture,
} from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Moment } from '../fx/map.ts';
import { content } from '../game/engine.ts';
import { useDarkTheme, useReducedMotion } from '../settings/hooks.ts';
import { seatOf } from '../ui/common/stats.ts';
import { type Coin, spawn, step } from './coins.ts';
import { buildingFrame } from './frames.ts';
import { type BoardLayout, boardLayout, pointAt, stepToward } from './layout.ts';

extend({ Container, Graphics, ParticleContainer, Sprite, Text });

const INK = 0x1f1b2e;
const CREAM = 0xfff6e9;
const SLATE = 0x5b5872;
const CORAL = 0xff5a4e;
const MUSTARD = 0xffc23d;

/** Steps of the loop a token covers per second. */
const TOKEN_SPEED = 5;

interface Sheets {
  locations: Spritesheet;
  busts: Spritesheet;
}

let sheetsPromise: Promise<Sheets> | null = null;
function loadSheets(): Promise<Sheets> {
  sheetsPromise ??= Promise.all([
    Assets.load<Spritesheet>('/assets/atlases/locations.json'),
    Assets.load<Spritesheet>('/assets/atlases/busts.json'),
  ]).then(([locations, busts]) => ({ locations, busts }));
  return sheetsPromise;
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

/** Which emotion a player's bust shows, from how their week is going. */
function emotion(stats: GameState['players'][number]['stats']): string {
  if (stats.energy < 20) return 'exhausted';
  if (stats.happiness < 30 || stats.health < 30) return 'stressed';
  if (stats.happiness >= 75) return 'happy';
  return 'neutral';
}

const LABEL_STYLE: TextStyleOptions = {
  fontFamily: 'Atkinson Hyperlegible Next Variable, system-ui, sans-serif',
  fontSize: 13,
  fontWeight: '700',
  fill: INK,
  stroke: { color: CREAM, width: 4, join: 'round' },
  align: 'center',
};

function Road({ layout }: { layout: BoardLayout }) {
  const draw = useCallback(
    (g: Graphics) => {
      const { cx, cy, rx, ry, cell, count } = layout;
      const w = Math.max(10, cell * 0.22);
      const r = Math.min(rx, ry);
      g.clear();
      g.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, r).stroke({ color: INK, width: w + 6 });
      g.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, r).stroke({ color: SLATE, width: w });
      // Lane markings: short cream dashes along the loop.
      const dashes = 56;
      for (let i = 0; i < dashes; i++) {
        const a = pointAt(layout, (i / dashes) * count);
        const b = pointAt(layout, ((i + 0.4) / dashes) * count);
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
      g.stroke({ color: CREAM, width: 2, alpha: 0.8 });
    },
    [layout],
  );
  return <pixiGraphics draw={draw} />;
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
  const { x, y } = pointAt(layout, index);
  const { cell } = layout;
  const drawPad = useCallback(
    (g: Graphics) => {
      g.clear();
      g.ellipse(0, 0, cell * 0.5, cell * 0.2)
        .fill(here ? MUSTARD : CREAM)
        .stroke({
          color: here ? CORAL : INK,
          width: here ? 5 : 3,
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
        <pixiSprite texture={texture} anchor={{ x: 0.5, y: 1 }} y={cell * 0.08} scale={scale} />
      )}
    </pixiContainer>
  );
}

/** Building names, drawn above the night grade so they stay readable (NFR-04). */
function Label({
  layout,
  index,
  text,
  dark,
}: {
  layout: BoardLayout;
  index: number;
  text: string;
  dark: boolean;
}) {
  const { x, y } = pointAt(layout, index);
  const { cell } = layout;
  return (
    <pixiText
      text={text}
      x={x}
      y={y + cell * 0.16}
      style={{
        ...LABEL_STYLE,
        fontSize: Math.max(11, Math.min(14, cell * 0.13)),
        ...(dark ? { fill: CREAM, stroke: { color: INK, width: 4, join: 'round' } } : {}),
      }}
      anchor={{ x: 0.5, y: 0 }}
      resolution={2}
    />
  );
}

function Token({
  layout,
  target,
  offset,
  colour,
  texture,
  active,
  reduced,
}: {
  layout: BoardLayout;
  target: number;
  offset: number;
  colour: string;
  texture: Texture | undefined;
  active: boolean;
  reduced: boolean;
}) {
  const ref = useRef<Container>(null);
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
    // Tokens stand on the road in front of the building's left corner, clear of its label.
    c.x = p.x - layout.cell * 0.42 + offset;
    c.y = p.y - layout.cell * 0.12 + bob;
    const sq = Math.sin(squash.current * Math.PI) * 0.18;
    const pp = 1 + Math.sin(pop.current * Math.PI) * 0.15;
    c.scale.set((1 + sq) * pp, (1 - sq) * pp);
  }, [layout, offset, reduced, active]);

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
          pos.current = stepToward(pos.current, target, TOKEN_SPEED * dt, layout.count);
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

/** Lit windows for the dark board (art-direction §4): warm dots on each building, the same every night. */
function Windows({ layout, count }: { layout: BoardLayout; count: number }) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const { cell } = layout;
      for (let i = 0; i < count; i++) {
        const { x, y } = pointAt(layout, i);
        for (let k = 0; k < 4; k++) {
          // A fixed scatter per building, so windows don't flicker between renders.
          const wx = x + (((i * 7 + k * 13) % 9) / 9 - 0.5) * cell * 0.5;
          const wy = y - cell * (0.25 + (((i * 5 + k * 11) % 7) / 7) * 0.45);
          g.roundRect(wx - cell * 0.03, wy - cell * 0.03, cell * 0.06, cell * 0.06, 2).fill({
            color: MUSTARD,
            alpha: 0.9,
          });
          g.circle(wx, wy, cell * 0.09).fill({ color: MUSTARD, alpha: 0.18 });
        }
      }
    },
    [layout, count],
  );
  return <pixiGraphics draw={draw} blendMode="add" />;
}

/** The night grade for the dark theme: darker, cooler, a little less saturated. One shared filter for the app. */
let night: ColorMatrixFilter | null = null;
function nightFilter(): ColorMatrixFilter {
  if (night) return night;
  night = new ColorMatrixFilter();
  night.brightness(0.62, false);
  night.saturate(-0.15, true);
  night.tint(0x9fa8ff, true);
  return night;
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
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const dark = useDarkTheme();
  const filters = useMemo(() => (dark ? [nightFilter()] : []), [dark]);
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
  if (size.w === 0) return null;

  const me = state.players.find((p) => p.id === active) ?? state.players[0];
  const frameFor = (id: string) => buildingFrame(id, me?.housing.tier);

  // Draw the far side of the loop first, so nearer buildings overlap it.
  const order = locations
    .map((id, index) => ({ id, index, y: pointAt(layout, index).y }))
    .sort((a, b) => a.y - b.y);

  const byLocation = new Map<string, string[]>();
  for (const p of state.players)
    byLocation.set(p.location, [...(byLocation.get(p.location) ?? []), p.id]);

  const meIndex = me ? Math.max(0, locations.indexOf(me.location)) : 0;
  const mePoint = pointAt(layout, meIndex);

  return (
    <pixiContainer>
      <pixiContainer filters={filters}>
        <Road layout={layout} />
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
        {state.players
          .filter((p) => p.id !== active)
          .concat(state.players.filter((p) => p.id === active))
          .map((p) => {
            const index = locations.indexOf(p.location);
            const here = byLocation.get(p.location) ?? [];
            const k = here.indexOf(p.id);
            const offset = k * layout.token * 0.7;
            const seat = seatOf(state.players, p.id);
            return (
              <Token
                key={p.id}
                layout={layout}
                target={Math.max(0, index)}
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
      {dark && <Windows layout={layout} count={locations.length} />}
      {order.map(({ id, index }) => (
        <Label key={id} layout={layout} index={index} text={t(`location.${id}`)} dark={dark} />
      ))}
      {!reduced && (
        <Coins
          burst={fx}
          x={mePoint.x - layout.cell * 0.42}
          y={mePoint.y - layout.cell * 0.2}
          scale={Math.max(0.6, layout.token / 64)}
        />
      )}
    </pixiContainer>
  );
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
