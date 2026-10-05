/** Mechanical check that the engine stays pure and deterministic (NFR-12, tech-stack §2). */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BANNED: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random (use the seeded streams in rng.ts)'],
  [/\bDate\b/, 'Date (time must come from game state)'],
  [/\bperformance\b/, 'performance'],
  [/\b(window|document|navigator|localStorage|globalThis|process)\b/, 'host globals'],
  [/\b(setTimeout|setInterval|fetch|crypto|structuredClone)\b/, 'async or host APIs'],
  [/from 'node:/, 'Node built-ins'],
  [
    /^import (?!type )[^;]*from '@fastlane\/content'/m,
    'a runtime import of @fastlane/content, which pulls Zod into the client (use @fastlane/content/keys)',
  ],
];

const srcDir = new URL('./', import.meta.url);
const sources = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

describe('engine purity', () => {
  it('scans the engine sources', () => {
    expect(sources).toContain('engine.ts');
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
