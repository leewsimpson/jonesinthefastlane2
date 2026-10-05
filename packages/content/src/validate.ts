/** Validates every content file against its schema. CI fails on invalid content (CI-01, FR-74). */
import { readFileSync } from 'node:fs';
import { MetaSchema } from './schemas.ts';

const files = [{ path: new URL('../data/meta.json', import.meta.url), schema: MetaSchema }];

let failed = false;
for (const { path, schema } of files) {
  const result = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (result.success) {
    console.log(`ok   ${path.pathname}`);
  } else {
    failed = true;
    console.error(`FAIL ${path.pathname}\n${result.error.message}`);
  }
}
process.exit(failed ? 1 : 0);
