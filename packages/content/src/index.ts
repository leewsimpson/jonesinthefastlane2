import balanceJson from '../data/balance.json' with { type: 'json' };
import defaultCityJson from '../data/cities/default/city.json' with { type: 'json' };
import defaultCoursesJson from '../data/cities/default/courses.json' with { type: 'json' };
import defaultHousingJson from '../data/cities/default/housing.json' with { type: 'json' };
import defaultItemsJson from '../data/cities/default/items.json' with { type: 'json' };
import defaultJobsJson from '../data/cities/default/jobs.json' with { type: 'json' };
import defaultSubscriptionsJson from '../data/cities/default/subscriptions.json' with {
  type: 'json',
};
import metaJson from '../data/meta.json' with { type: 'json' };
import enJson from '../locales/en.json' with { type: 'json' };
import {
  BalanceSchema,
  CitySchema,
  checkContent,
  checkStrings,
  type GameContent,
  MetaSchema,
  StringsSchema,
} from './schemas.ts';

export * from './schemas.ts';

export const meta = MetaSchema.parse(metaJson);
export const balance = BalanceSchema.parse(balanceJson);
/** A city profile is a folder of files (FR-33), merged into one `City`. See `CITY_FILES`. */
export const defaultCity = CitySchema.parse({
  ...defaultCityJson,
  jobs: defaultJobsJson,
  courses: defaultCoursesJson,
  housing: defaultHousingJson,
  items: defaultItemsJson,
  subscriptions: defaultSubscriptionsJson,
});
/** English copy (NFR-06). i18next loads it in Phase 4. */
export const en = StringsSchema.parse(enJson);

/** The content bundle the game ships with. Throws if any cross-reference or string is missing. */
export const defaultContent: GameContent = assertContent({ meta, balance, city: defaultCity });

function assertContent(content: GameContent): GameContent {
  const problems = [...checkContent(content), ...checkStrings(content, en)];
  if (problems.length > 0) throw new Error(`Invalid content:\n${problems.join('\n')}`);
  return content;
}
