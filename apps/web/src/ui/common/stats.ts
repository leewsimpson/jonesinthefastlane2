/**
 * How each stat looks (NFR-04: colour-blind-safe colours always paired with an icon and a label). Player colours and
 * shapes come from art-direction §2: a colour is never the only cue.
 */
import type { StatKey } from '@fastlane/content/keys';
import type { PlayerState } from '@fastlane/engine';
import type { IconName } from './Icon.tsx';

export const STAT_ICON: Record<StatKey | 'time' | 'meals', string> = {
  cash: '$',
  energy: '⚡',
  health: '♥',
  happiness: '☺',
  social: '👥',
  creditScore: '★',
  wardrobe: '👕',
  time: '⏱',
  meals: '🍔',
};

/** Tailwind text colour per stat, 3:1 or better on the panel surface in both themes (NFR-04, art-direction §2). */
export const STAT_TONE: Record<StatKey | 'time' | 'meals', string> = {
  cash: 'text-good',
  energy: 'text-tone-energy',
  health: 'text-tone-health',
  happiness: 'text-tone-happiness',
  social: 'text-tone-social',
  creditScore: 'text-tone-credit',
  wardrobe: 'text-fg-muted',
  time: 'text-tone-time',
  meals: 'text-tone-meals',
};

/** The dashboard's SVG icon per stat (art-direction §2: functional icons are code-native SVG). */
export const STAT_SVG: Record<StatKey | 'time' | 'meals', IconName> = {
  cash: 'cash',
  energy: 'bolt',
  health: 'heart',
  happiness: 'smile',
  social: 'users',
  creditScore: 'card',
  wardrobe: 'bag',
  time: 'clock',
  meals: 'meal',
};

/** Bar fills per stat, from the palette: each bar also shows its icon, label and number. */
export const STAT_FILL: Record<
  'energy' | 'health' | 'happiness' | 'social' | 'creditScore',
  string
> = {
  // Brighter related shades of the palette (art-direction §2), as the concept's dashboard draws its bars. Each bar
  // has an ink-bordered track, so the fill needs no contrast of its own.
  energy: '#6aaa4f',
  health: '#c0503c',
  happiness: '#e9b02f',
  social: 'var(--color-lilac)',
  creditScore: '#3f78b5',
};

/** Seat colours and shapes. Humans take p1–p4 in seat order; AI rivals wear Jones's colour. */
export const HUMAN_COLOURS = ['#e69f00', '#56b4e9', '#009e73', '#d55e00'];
const SHAPES = ['●', '■', '▲', '◆'] as const;
export const JONES_COLOUR = '#cc79a7';

export interface Seat {
  colour: string;
  shape: string;
  /** Bust sprite prefix in the busts atlas. */
  avatar: string;
}

export function seatOf(players: readonly { id: string; controller: string }[], id: string): Seat {
  let human = 0;
  for (const p of players) {
    if (p.id === id) {
      if (p.controller === 'ai') return { colour: JONES_COLOUR, shape: '★', avatar: 'jones' };
      return {
        colour: HUMAN_COLOURS[human % 4] ?? '#e69f00',
        shape: SHAPES[human % 4] ?? '●',
        avatar: `player-0${(human % 6) + 1}`,
      };
    }
    if (p.controller === 'human') human++;
  }
  return { colour: '#78858b', shape: '●', avatar: 'player-01' };
}

/** Which emotion a player's bust shows, from how their week is going. */
export function emotion(
  stats: Pick<PlayerState['stats'], 'energy' | 'happiness' | 'health'>,
): string {
  if (stats.energy < 20) return 'exhausted';
  if (stats.happiness < 30 || stats.health < 30) return 'stressed';
  if (stats.happiness >= 75) return 'happy';
  return 'neutral';
}
