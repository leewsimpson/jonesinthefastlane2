/**
 * Which sound effects a batch of events earns (NFR-05). Pure, like `fxFor`, so the rules are tested without audio.
 * Names are the keys of the sprite map `public/assets/audio/sfx.json` (built by `scripts/build-sfx-sprite.mjs`).
 */
import type { Fx, Moment } from '../fx/map.ts';

export type SfxName =
  | 'tap'
  | 'coin'
  | 'coin-burst'
  | 'cash-out'
  | 'pop-good'
  | 'pop-bad'
  | 'hired'
  | 'promoted'
  | 'credential'
  | 'quest'
  | 'moved'
  | 'laid-off'
  | 'evicted'
  | 'card-flip'
  | 'dice-roll'
  | 'token-step'
  | 'rent-due'
  | 'robot-beep';

const MOMENT: Record<Moment['kind'], SfxName> = {
  hired: 'hired',
  promoted: 'promoted',
  paid: 'cash-out',
  credential: 'credential',
  quest: 'quest',
  moved: 'moved',
  laidOff: 'laid-off',
  letGo: 'laid-off',
  evicted: 'evicted',
};

/** A moment's sting, then the coin shower; a plain stat change only gets a blip when nothing else sounds. */
export function sfxFor(fx: Fx): SfxName[] {
  const out: SfxName[] = [];
  if (fx.moment) out.push(MOMENT[fx.moment.kind]);
  if (fx.coins > 0) out.push('coin-burst');
  if (out.length === 0 && fx.pops.length > 0)
    out.push(fx.pops.some((p) => p.tone === 'bad') ? 'pop-bad' : 'pop-good');
  return out;
}
