/**
 * Initial JS budget (NFR-10, CI-05): the entry script plus every chunk `index.html` modulepreloads, read from the
 * build so new shared chunks are counted without editing a glob.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
const scripts = [
  ...html.matchAll(
    /<(?:script[^>]*\bsrc|link[^>]*rel="modulepreload"[^>]*\bhref)="\/([^"]+\.js)"/g,
  ),
].map((m) => `dist/${m[1]}`);

export default [{ name: 'initial JS (gzip)', path: scripts, limit: '300 KB', gzip: true }];
