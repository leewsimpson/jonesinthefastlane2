/** Validates every content file against its schema, then cross-references. CI fails on invalid content (CI-01, FR-74). */
import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  AiSchema,
  BalanceSchema,
  CITY_FILES,
  CitySchema,
  checkContent,
  checkStrings,
  MetaSchema,
  NewsSchema,
  QuestSchema,
  StringsSchema,
  WeekendEventSchema,
} from './schemas.ts';
import { KpiBandSchema, PersonaSchema } from './sim.ts';

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
const events = load('events.json', z.array(WeekendEventSchema));
const news = load('news.json', z.array(NewsSchema));
const quests = load('quests.json', z.array(QuestSchema));
const ai = load('ai.json', AiSchema);
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
  if (!city || !meta || !balance || !events || !news || !quests || !ai) continue;
  if (city.id !== id) {
    failed = true;
    console.error(`FAIL ${relative}: id "${city.id}" doesn't match its folder`);
  }
  const content = { meta, balance, city, events, news, quests, ai };
  for (const problem of [...checkContent(content), ...(en ? checkStrings(content, en) : [])]) {
    failed = true;
    console.error(`FAIL ${relative}: ${problem}`);
  }
}

// Simulator personas (simulator §3) are content too.
const personas = z
  .array(PersonaSchema)
  .safeParse(JSON.parse(readFileSync(new URL('../sim/personas.json', import.meta.url), 'utf8')));
if (personas.success) console.log('ok   sim/personas.json');
else {
  failed = true;
  console.error(`FAIL sim/personas.json
${personas.error.message}`);
}

const bands = z
  .array(KpiBandSchema)
  .safeParse(JSON.parse(readFileSync(new URL('../sim/kpi-bands.json', import.meta.url), 'utf8')));
if (bands.success) console.log('ok   sim/kpi-bands.json');
else {
  failed = true;
  console.error(`FAIL sim/kpi-bands.json
${bands.error.message}`);
}

process.exit(failed ? 1 : 0);
