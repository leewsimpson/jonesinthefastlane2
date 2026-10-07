/**
 * Art from a packed atlas (art-direction §6) as a plain DOM element (CSS background), for places outside the Pixi
 * canvas: buildings, items. Each atlas's frames load once; until then, and if they fail, an empty box of the same
 * size keeps the layout still.
 */
import { useEffect, useState } from 'react';
import { content } from '../../game/engine.ts';

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Atlas {
  image: string;
  size: { w: number; h: number };
  frames: Record<string, Frame>;
}

export type AtlasName = 'locations' | 'items';

const BASE = '/assets/atlases/';
const atlases = new Map<AtlasName, Promise<Atlas>>();
function loadAtlas(name: AtlasName): Promise<Atlas> {
  let p = atlases.get(name);
  if (!p) {
    p = fetch(`${BASE}${name}.json`)
      .then((r) => r.json())
      .then(
        (d: {
          frames: Record<string, { frame: Frame }>;
          meta: { image: string; size: Atlas['size'] };
        }) => ({
          image: BASE + d.meta.image,
          size: d.meta.size,
          frames: Object.fromEntries(Object.entries(d.frames).map(([k, v]) => [k, v.frame])),
        }),
      );
    atlases.set(name, p);
  }
  return p;
}

export function AtlasArt({
  atlas: name,
  frame,
  width,
  ratio = 0.88,
}: {
  atlas: AtlasName;
  frame: string;
  width: number;
  /** Placeholder height ÷ width while the atlas loads. */
  ratio?: number;
}) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    let live = true;
    loadAtlas(name)
      .then((a) => live && setAtlas(a))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  const f = atlas?.frames[frame];
  if (!atlas || !f)
    return <div aria-hidden="true" className="shrink-0" style={{ width, height: width * ratio }} />;
  const k = Math.min(width / f.w, (width * Math.max(ratio, 1)) / f.h);
  return (
    <div
      aria-hidden="true"
      className="shrink-0"
      style={{
        width: f.w * k,
        height: f.h * k,
        backgroundImage: `url(${atlas.image})`,
        backgroundSize: `${atlas.size.w * k}px ${atlas.size.h * k}px`,
        backgroundPosition: `${-f.x * k}px ${-f.y * k}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}

export function BuildingArt({ frame, width }: { frame: string; width: number }) {
  return <AtlasArt atlas="locations" frame={frame} width={width} />;
}

/** Item and subscription art ids (art-direction §9.3); things without art get none. */
const ITEM_FRAME: Record<string, string> = {
  laptop: 'item-laptop',
  smartphone: 'item-phone',
  'noise-cancelling-headphones': 'item-headphones',
  'e-scooter': 'item-e-scooter',
  fridge: 'item-fridge',
  'air-fryer': 'item-air-fryer',
  'smart-lock': 'item-smart-lock',
  'smart-outfit': 'outfit-smart',
  'business-suit': 'outfit-business',
  'founder-hoodie': 'outfit-founder-hoodie',
  'ai-assistant': 'item-ai-assistant',
};

export const itemFrame = (id: string): string | undefined => ITEM_FRAME[id];

export function ItemArt({ id, size }: { id: string; size: number }) {
  const frame = ITEM_FRAME[id];
  if (!frame) return null;
  return <AtlasArt atlas="items" frame={frame} width={size} ratio={1} />;
}

/** The home interior for a housing tier (art-direction §9.5), 1-based like the building frames. */
export function interiorFor(housingTier: string): string {
  const tier = Math.max(
    0,
    content.city.housing.findIndex((h) => h.id === housingTier),
  );
  return `/assets/backgrounds/interior-tier-${tier + 1}.webp`;
}
