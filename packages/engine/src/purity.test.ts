/** Source scan: no banned APIs in the engine (engine-design §5, NFR-12). Biome can't ban single `Math` methods. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BANNED: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random (use the seeded streams in rng/)'],
  [/\bDate\b/, 'Date (time must come from game state)'],
  [/\bperformance\b/, 'performance'],
  [/\bcrypto\b/, 'crypto'],
  [
    /\bMath\.(pow|exp|expm1|log\w*|sin\w*|cos\w*|tan\w*|a(?:cos|sin|tan)\w*|cbrt|hypot|fround)\b/,
    'Math functions that can differ between JS engines',
  ],
  [/\*\*/, 'the ** operator (can differ between JS engines)'],
  [/\b(localeCompare|Intl|toLocale\w*)\b/, 'locale-dependent APIs'],
  [
    /\b(async|await|Promise|setTimeout|setInterval|queueMicrotask)\b/,
    'async code (the engine is synchronous)',
  ],
  [
    /\b(window|document|navigator|localStorage|globalThis|process|fetch|structuredClone)\b/,
    'host globals',
  ],
  [/from 'node:/, 'Node built-ins'],
  [
    /^import (?!type )[^;]*from '@fastlane\/content'/m,
    'a runtime import of @fastlane/content, which pulls Zod into the client (use @fastlane/content/keys)',
  ],
];

const srcDir = new URL('./', import.meta.url);
const sources = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('__fixtures__/'));

describe('engine purity', () => {
  it('scans the engine sources', () => {
    expect(sources).toContain('core/reduce.ts');
  });

  for (const file of sources) {
    it(`${file} uses no non-deterministic or host APIs`, () => {
      // Strip comments so docs can mention the banned names.
      const code = readFileSync(new URL(file, srcDir), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const found = BANNED.filter(([re]) => re.test(code)).map(([, why]) => why);
      expect(found).toEqual([]);
    });
  }
});
