/**
 * A building from the locations atlas as a plain DOM element (CSS background), for places outside the Pixi canvas.
 * The atlas frames load once; until then, and if they fail, nothing is drawn and the layout doesn't move.
 */
import { useEffect, useState } from 'react';

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

const BASE = '/assets/atlases/';
let atlasPromise: Promise<Atlas> | null = null;
function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= fetch(`${BASE}locations.json`)
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
  return atlasPromise;
}

export function BuildingArt({ frame, width }: { frame: string; width: number }) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    let live = true;
    loadAtlas()
      .then((a) => live && setAtlas(a))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const f = atlas?.frames[frame];
  if (!atlas || !f) return <div aria-hidden="true" style={{ width, height: width * 0.88 }} />;
  const k = width / f.w;
  return (
    <div
      aria-hidden="true"
      className="shrink-0"
      style={{
        width,
        height: f.h * k,
        backgroundImage: `url(${atlas.image})`,
        backgroundSize: `${atlas.size.w * k}px ${atlas.size.h * k}px`,
        backgroundPosition: `${-f.x * k}px ${-f.y * k}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
