import metaJson from '../data/meta.json' with { type: 'json' };
import { MetaSchema } from './schemas.ts';

export * from './schemas.ts';

export const meta = MetaSchema.parse(metaJson);
