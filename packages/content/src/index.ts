import balanceJson from '../data/balance.json' with { type: 'json' };
import defaultCityJson from '../data/cities/default/city.json' with { type: 'json' };
import metaJson from '../data/meta.json' with { type: 'json' };
import {
  BalanceSchema,
  CitySchema,
  checkContent,
  type GameContent,
  MetaSchema,
} from './schemas.ts';

export * from './schemas.ts';

export const meta = MetaSchema.parse(metaJson);
export const balance = BalanceSchema.parse(balanceJson);
export const defaultCity = CitySchema.parse(defaultCityJson);

/** The content bundle the game ships with. Throws if any cross-reference is broken. */
export const defaultContent: GameContent = assertContent({ meta, balance, city: defaultCity });

function assertContent(content: GameContent): GameContent {
  const problems = checkContent(content);
  if (problems.length > 0) throw new Error(`Invalid content:\n${problems.join('\n')}`);
  return content;
}
