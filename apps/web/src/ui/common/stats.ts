/**
 * How each stat looks (NFR-04: colour-blind-safe colours always paired with an icon and a label). Player colours and
 * shapes come from art-direction §2: a colour is never the only cue.
 */
import type { StatKey } from '@fastlane/content/keys';

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

/** Tailwind text colour per stat, readable on cream and on night (WCAG AA for the bold icon glyphs). */
export const STAT_TONE: Record<StatKey | 'time' | 'meals', string> = {
  cash: 'text-teal',
  energy: 'text-mustard',
  health: 'text-coral',
  happiness: 'text-lilac',
  social: 'text-sky',
  creditScore: 'text-slate dark:text-fg-muted',
  wardrobe: 'text-slate dark:text-fg-muted',
  time: 'text-sky',
  meals: 'text-mustard',
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
  return { colour: '#5b5872', shape: '●', avatar: 'player-01' };
}
