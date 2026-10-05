import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const respond = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('loadConfig', () => {
  it('reads config and trims trailing slashes', async () => {
    const config = await loadConfig(respond({ environment: 'preview', apiBase: 'https://api.x/' }));
    expect(config).toEqual({ environment: 'preview', apiBase: 'https://api.x' });
  });

  it('rejects malformed config', async () => {
    await expect(loadConfig(respond({ apiBase: 1 }))).rejects.toThrow('expected');
  });

  it('rejects HTTP errors', async () => {
    await expect(loadConfig(respond({}, 404))).rejects.toThrow('404');
  });
});
