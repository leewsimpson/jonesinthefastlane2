/** Validates every content file against its schema, then cross-references. CI fails on invalid content (CI-01, FR-74). */
import { readdirSync, readFileSync } from 'node:fs';
import type { z } from 'zod';
import {
  BalanceSchema,
  CITY_FILES,
  CitySchema,
  checkContent,
  checkStrings,
  MetaSchema,
  StringsSchema,
} from './schemas.ts';

const dataDir = new URL('../data/', import.meta.url);
const localesDir = new URL('../locales/', import.meta.url);
let failed = false;

function load<T extends z.ZodType>(
  relative: string,
  schema: T,
  dir: URL = dataDir,
): z.infer<T> | undefined {
  const path = new URL(relative, dir);
  const result = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (result.success) {
    console.log(`ok   ${relative}`);
    return result.data;
  }
  failed = true;
  console.error(`FAIL ${relative}\n${result.error.message}`);
  return undefined;
}

const meta = load('meta.json', MetaSchema);
const balance = load('balance.json', BalanceSchema);
const en = load('en.json', StringsSchema, localesDir);
const cityIds = readdirSync(new URL('cities/', dataDir), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

if (meta && !cityIds.includes(meta.defaultCity)) {
  failed = true;
  console.error(`FAIL meta.json: default city "${meta.defaultCity}" has no cities/ folder`);
}

const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(new URL(relative, dataDir), 'utf8'));

for (const id of cityIds) {
  const relative = `cities/${id}/`;
  // A city profile is a folder: city.json plus one file per section (FR-33).
  const merged = { ...(readJson(`${relative}city.json`) as object) } as Record<string, unknown>;
  for (const [field, file] of Object.entries(CITY_FILES)) merged[field] = readJson(relative + file);
  const result = CitySchema.safeParse(merged);
  const city = result.success ? result.data : undefined;
  if (result.success) console.log(`ok   ${relative}`);
  else {
    failed = true;
    console.error(`FAIL ${relative}\n${result.error.message}`);
  }
  if (!city || !meta || !balance) continue;
  if (city.id !== id) {
    failed = true;
    console.error(`FAIL ${relative}: id "${city.id}" doesn't match its folder`);
  }
  const content = { meta, balance, city };
  for (const problem of [...checkContent(content), ...(en ? checkStrings(content, en) : [])]) {
    failed = true;
    console.error(`FAIL ${relative}: ${problem}`);
  }
}

process.exit(failed ? 1 : 0);
