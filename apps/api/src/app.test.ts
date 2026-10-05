import { describe, expect, it } from 'vitest';
import { app } from './app.ts';

const env = { ENVIRONMENT: 'test', VERSION: 'abc123' };

describe('api', () => {
  it('reports health with the deployed version', async () => {
    const res = await app.request('/healthz', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Fastlane-Version')).toBe('abc123');
    expect(await res.json()).toEqual({ ok: true, environment: 'test', version: 'abc123' });
  });

  it('allows CORS only from Fast Lane origins', async () => {
    const ok = await app.request(
      '/healthz',
      { headers: { Origin: 'https://pr-1.fastlane-e6g.pages.dev' } },
      env,
    );
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://pr-1.fastlane-e6g.pages.dev',
    );
    const bad = await app.request('/healthz', { headers: { Origin: 'https://evil.example' } }, env);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
