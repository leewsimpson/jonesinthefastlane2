/**
 * Sprite pipeline (art-direction §6, art track A6): raw generations in art/src → game-ready WebP in public/assets.
 *
 * - Sprites (characters, busts, locations, items): key out #FF00FF, trim, resize to 2× display size, and pack into
 *   one Pixi v8 spritesheet per atlas. Sheets declare `scale: 2`, so frames draw at 1× display size.
 * - Emotion sheets are sliced into six busts named `<character>/<emotion>`.
 * - Scenes (event cards, backdrop, interiors) are full-bleed: re-encoded as WebP, no keying or packing.
 *
 *   pnpm --filter @fastlane/web sprites
 */
import { readdirSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { alphaBounds, gridCells, type Rect } from './bounds.ts';
import { keyMagenta } from './key.ts';
import { pack } from './pack.ts';

const artDir = new URL('../../../../art/src/', import.meta.url);
const outDir = new URL('../../public/assets/', import.meta.url);
/** sharp takes paths, not URLs. */
const art = (path: string) => fileURLToPath(new URL(path, artDir));
const out = (path: string) => fileURLToPath(new URL(path, outDir));

/** Display scale baked into the sheets: sprites are stored at 2× their in-game size (art-direction §4). */
const SCALE = 2;
const PLAYER_EMOTIONS = ['neutral', 'happy', 'stressed', 'exhausted', 'shocked', 'proud'];
/**
 * Jones's sheet uses his own expressions (art-direction §9.2), mapped onto the shared names so the UI asks every
 * character for the same emotion: humble-brag → proud, rattled → stressed, "posting through it" → exhausted.
 */
const JONES_EMOTIONS = ['neutral', 'happy', 'proud', 'stressed', 'shocked', 'exhausted'];

interface Anchor {
  x: number;
  y: number;
}

interface AtlasSpec {
  atlas: string;
  category: string;
  include: (id: string) => boolean;
  /** Bounding box at 2× display size. Sprites shrink to fit and are never enlarged. */
  fit: [number, number];
  anchor: Anchor;
  /** Present for character sheets: slice into a cols × rows grid. */
  grid?: [number, number];
}

const BOTTOM_CENTRE = { x: 0.5, y: 1 };
const CENTRE = { x: 0.5, y: 0.5 };

const ATLASES: AtlasSpec[] = [
  {
    atlas: 'characters',
    category: 'characters',
    include: (id) => !id.endsWith('-emotions'),
    fit: [320, 480],
    anchor: BOTTOM_CENTRE,
  },
  {
    atlas: 'busts',
    category: 'characters',
    include: (id) => id.endsWith('-emotions'),
    fit: [192, 192],
    anchor: CENTRE,
    grid: [3, 2],
  },
  {
    atlas: 'locations',
    category: 'locations',
    include: () => true,
    fit: [400, 400],
    anchor: BOTTOM_CENTRE,
  },
  { atlas: 'items', category: 'items', include: () => true, fit: [256, 256], anchor: CENTRE },
];

const SCENE_CATEGORIES = ['events', 'backgrounds'];

interface Sprite {
  id: string;
  width: number;
  height: number;
  data: Buffer;
  anchor: Anchor;
}

function ids(category: string): string[] {
  return readdirSync(new URL(`${category}/`, artDir))
    .filter((f) => f.endsWith('.png'))
    .map((f) => basename(f, '.png'))
    .sort();
}

async function loadKeyed(category: string, id: string) {
  const { data, info } = await sharp(art(`${category}/${id}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  keyMagenta(px);
  return { px, width: info.width, height: info.height };
}

async function cutSprite(
  px: Uint8Array,
  width: number,
  height: number,
  box: Rect,
  fit: [number, number],
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(px, { raw: { width, height, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .resize({ width: fit[0], height: fit[1], fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function spritesFor(spec: AtlasSpec): Promise<Sprite[]> {
  const sprites: Sprite[] = [];
  for (const id of ids(spec.category).filter(spec.include)) {
    const { px, width, height } = await loadKeyed(spec.category, id);
    const whole = { x: 0, y: 0, width, height };
    const regions = spec.grid ? gridCells(px, width, height, ...spec.grid) : [whole];
    const character = id.replace(/-emotions$/, '');
    const emotions = character === 'jones' ? JONES_EMOTIONS : PLAYER_EMOTIONS;
    for (const [i, region] of regions.entries()) {
      const box = alphaBounds(px, width, region);
      if (!box) throw new Error(`${spec.category}/${id}: region ${i} has no art after keying`);
      const name = spec.grid ? `${character}/${emotions[i]}` : id;
      sprites.push({
        id: name,
        anchor: spec.anchor,
        ...(await cutSprite(px, width, height, box, spec.fit)),
      });
    }
  }
  return sprites;
}

async function writeAtlas(spec: AtlasSpec): Promise<void> {
  const sprites = await spritesFor(spec);
  const byId = new Map(sprites.map((s) => [s.id, s]));
  const { pages, placements } = pack(sprites);
  const pageName = (page: number) => (page === 0 ? spec.atlas : `${spec.atlas}-${page}`);

  for (const [page, size] of pages.entries()) {
    const onPage = placements.filter((p) => p.page === page);
    const image = `${pageName(page)}.webp`;
    await sharp({
      create: {
        width: size.width,
        height: size.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        onPage.map((p) => ({
          input: (byId.get(p.id) as Sprite).data,
          raw: { width: p.width, height: p.height, channels: 4 as const },
          left: p.x,
          top: p.y,
        })),
      )
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(out(`atlases/${image}`));

    const frames = Object.fromEntries(
      onPage
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((p) => [
          p.id,
          {
            frame: { x: p.x, y: p.y, w: p.width, h: p.height },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: p.width, h: p.height },
            sourceSize: { w: p.width, h: p.height },
            anchor: (byId.get(p.id) as Sprite).anchor,
          },
        ]),
    );
    const meta = {
      app: '@fastlane/web scripts/sprites',
      image,
      format: 'RGBA8888',
      size: { w: size.width, h: size.height },
      scale: SCALE,
      ...(page === 0 && pages.length > 1
        ? { related_multi_packs: pages.slice(1).map((_, i) => `${pageName(i + 1)}.json`) }
        : {}),
    };
    await writeFile(
      new URL(`atlases/${pageName(page)}.json`, outDir),
      `${JSON.stringify({ frames, meta }, null, 2)}\n`,
    );
    console.log(
      `atlas  ${pageName(page).padEnd(12)} ${onPage.length} frames, ${size.width}×${size.height}`,
    );
  }
}

async function writeScenes(category: string): Promise<void> {
  await mkdir(new URL(`${category}/`, outDir), { recursive: true });
  for (const id of ids(category)) {
    await sharp(art(`${category}/${id}.png`))
      .webp({ quality: 85, effort: 6 })
      .toFile(out(`${category}/${id}.webp`));
  }
  console.log(`scenes ${category.padEnd(12)} ${ids(category).length} images`);
}

// Generated output only: clear it so renamed or deleted art doesn't linger.
for (const dir of ['atlases', ...SCENE_CATEGORIES]) {
  rmSync(new URL(`${dir}/`, outDir), { recursive: true, force: true });
}
await mkdir(new URL('atlases/', outDir), { recursive: true });
for (const spec of ATLASES) await writeAtlas(spec);
for (const category of SCENE_CATEGORIES) await writeScenes(category);
