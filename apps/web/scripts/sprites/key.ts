/**
 * Chroma key for sprites generated on flat #FF00FF (art-direction §6).
 *
 * The key score is `min(R, B) − G`: 255 on pure magenta, and at most ~20 for every palette colour and skin tone
 * (lilac #8E7CF0 is the closest at 18). Anti-aliased edges are a blend of the art and the key, so their score falls
 * in between. We turn the score into alpha and un-mix the key out of the colour, which removes the magenta fringe.
 */
export interface KeyOptions {
  /** At or below this score a pixel is fully opaque art. */
  solid: number;
  /** At or above this score a pixel is pure background. */
  clear: number;
}

export const DEFAULT_KEY: KeyOptions = { solid: 48, clear: 216 };

const KEY_R = 255;
const KEY_G = 0;
const KEY_B = 255;

function channel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Keys out magenta in place. `px` is tightly packed RGBA. */
export function keyMagenta(px: Uint8Array, options: KeyOptions = DEFAULT_KEY): void {
  const { solid, clear } = options;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] as number;
    const g = px[i + 1] as number;
    const b = px[i + 2] as number;
    const score = Math.min(r, b) - g;
    if (score <= solid) continue;
    if (score >= clear) {
      px.fill(0, i, i + 4);
      continue;
    }
    // Observed = a·art + (1 − a)·key, solved for art.
    const a = (clear - score) / (clear - solid);
    px[i] = channel((r - (1 - a) * KEY_R) / a);
    px[i + 1] = channel((g - (1 - a) * KEY_G) / a);
    px[i + 2] = channel((b - (1 - a) * KEY_B) / a);
    px[i + 3] = channel(a * (px[i + 3] as number));
  }
}
