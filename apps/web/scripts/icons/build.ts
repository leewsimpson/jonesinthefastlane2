/**
 * App icons for the PWA manifest and the favicon (NFR-11): the home building on a cream tile, cut from the packed
 * locations atlas (the source PNGs live in Git LFS). `node scripts/icons/build.ts` writes `public/icons/`; run it
 * again after `pnpm sprites` if the art changes.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const atlas = join(root, 'public/assets/atlases');
const FRAME = 'your-place-3';
const out = join(root, 'public/icons');
const CREAM = { r: 255, g: 246, b: 233, alpha: 1 };

/** The art trimmed of its background and centred on a square tile, leaving `pad` of the size clear around it. */
async function icon(source: Buffer, size: number, pad: number, file: string) {
  const inner = Math.round(size * (1 - pad * 2));
  const art = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: art, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
}

const meta = JSON.parse(await readFile(join(atlas, 'locations.json'), 'utf8')) as {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { image: string };
};
const f = meta.frames[FRAME]?.frame;
if (!f) throw new Error(`no ${FRAME} frame in the locations atlas`);
const source = await sharp(join(atlas, meta.meta.image))
  .extract({ left: f.x, top: f.y, width: f.w, height: f.h })
  .png()
  .toBuffer();

await mkdir(out, { recursive: true });
await icon(source, 192, 0.06, 'icon-192.png');
await icon(source, 512, 0.06, 'icon-512.png');
// Maskable icons keep the art inside the safe zone (the middle 80%).
await icon(source, 512, 0.14, 'maskable-512.png');
await icon(source, 180, 0.08, 'apple-touch-icon.png');
await icon(source, 48, 0.04, 'favicon-48.png');
