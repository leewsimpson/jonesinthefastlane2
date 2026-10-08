import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, darkTheme, parseSettings, reducedMotion } from './settings.ts';

describe('parseSettings', () => {
  it('falls back to defaults for missing or broken storage', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps known values and drops unknown ones', () => {
    expect(
      parseSettings(
        JSON.stringify({
          theme: 'dark',
          motion: 'reduce',
          textSize: 130,
          tutorial: false,
          shareData: true,
        }),
      ),
    ).toEqual({ theme: 'dark', motion: 'reduce', textSize: 130, tutorial: false, shareData: true });
    expect(
      parseSettings(
        JSON.stringify({ theme: 'neon', textSize: 200, tutorial: 'yes', shareData: 'yes' }),
      ),
    ).toEqual(DEFAULT_SETTINGS);
  });
});

describe('preferences', () => {
  it('follows the OS only on "system"', () => {
    expect(reducedMotion('system', true)).toBe(true);
    expect(reducedMotion('system', false)).toBe(false);
    expect(reducedMotion('reduce', false)).toBe(true);
    expect(reducedMotion('full', true)).toBe(false);
    expect(darkTheme('system', true)).toBe(true);
    expect(darkTheme('light', true)).toBe(false);
    expect(darkTheme('dark', false)).toBe(true);
  });
});
