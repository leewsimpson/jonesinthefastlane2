/**
 * Seeded PRNG (engine-design §6, NFR-12): xoshiro128** seeded by hashing a string key with cyrb128. Written in-repo
 * so the state format is ours. Both use only `Math.imul` and bit operations, so every JS engine agrees.
 */

/** The four 32-bit words of a xoshiro128** generator, stored unsigned so they serialise stably. */
export type RngState = [number, number, number, number];

/** cyrb128: hashes a string into 128 bits, used directly as a generator state. */
export function cyrb128(text: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const state: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  // All zeros is xoshiro's one invalid state.
  if (state.every((w) => w === 0)) state[0] = 1;
  return state;
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

/** Largest span `int` accepts: `uint32 × span` must stay below 2^53 to be exact. */
const MAX_SPAN = 0x20_0000;

/** Integer-only draws. There is no float API: odds are basis points and weights are integers (engine-design §6). */
export interface Rng {
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `bp` / 10 000. */
  chance(bp: number): boolean;
  /** One value, with probability proportional to its integer weight. */
  pick<T>(items: readonly { weight: number; value: T }[]): T;
}

/** Wrap a generator state. Draws advance `state` in place. */
export function rngFrom(state: RngState): Rng {
  const int = (min: number, max: number) => {
    const span = max - min + 1;
    if (!Number.isInteger(min) || !Number.isInteger(max) || span < 1 || span > MAX_SPAN)
      throw new Error(`bad rng range [${min}, ${max}]`);
    // Exact: the product is below 2^53 and dividing by 2^32 only shifts the exponent.
    return min + Math.floor((nextUint32(state) * span) / 0x1_0000_0000);
  };
  return {
    int,
    chance: (bp) => int(0, 9_999) < bp,
    pick(items) {
      let total = 0;
      for (const item of items) {
        if (!Number.isInteger(item.weight) || item.weight < 0)
          throw new Error(`bad weight ${item.weight}`);
        total += item.weight;
      }
      if (total === 0) throw new Error('pick needs a positive total weight');
      let roll = int(0, total - 1);
      for (const item of items) {
        if (roll < item.weight) return item.value;
        roll -= item.weight;
      }
      throw new Error('unreachable: roll is below the total weight');
    },
  };
}

/** A standalone generator for code outside the game state, such as simulator bots. */
export function createRng(seedKey: string): Rng {
  return rngFrom(cyrb128(seedKey));
}
