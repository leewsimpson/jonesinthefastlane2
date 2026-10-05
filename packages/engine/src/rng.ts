/**
 * Seeded PRNG (NFR-12): xoshiro128** with named streams split from the run seed. Stream state lives inside the game
 * state, so saves and replays are exact. Each stream is derived from `seed + name` on first use, so adding a stream
 * (or a random call in one system) never shifts the outcomes of another.
 */

/** The four 32-bit words of a xoshiro128** generator, stored unsigned so they serialise stably. */
export type RngState = [number, number, number, number];

/** Named random streams. `world` is shared economy randomness: it must never depend on player choices. */
export const STREAMS = ['world', 'events', 'ai', 'gig', 'actions'] as const;
export type StreamName = (typeof STREAMS)[number];

/** 32-bit FNV-1a string hash. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Expand a 32-bit seed into a full generator state with splitmix32. */
export function seedRng(seed: number): RngState {
  let x = seed >>> 0;
  const word = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  // splitmix32 can't produce four zero words in a row, which is xoshiro's one invalid state.
  return [word(), word(), word(), word()];
}

export function streamSeed(runSeed: string, stream: StreamName): RngState {
  return seedRng(hashString(`${runSeed}:${stream}`));
}

const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));

/** Advance `s` in place and return the next unsigned 32-bit value. */
export function nextUint32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
  const t = s[1] << 9;
  s[2] ^= s[0];
  s[3] ^= s[1];
  s[1] ^= s[2];
  s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  for (let i = 0; i < 4; i++) s[i] = (s[i] as number) >>> 0;
  return result;
}

/** A float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextUint32(s) / 0x1_0000_0000;
}

/** An integer in [min, max], both inclusive. */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}
