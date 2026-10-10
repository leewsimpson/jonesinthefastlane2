import { Hono } from 'hono';
import { cors } from 'hono/cors';

export type Bindings = {
  ENVIRONMENT: string;
  VERSION: string;
  DB: D1Database;
  KV: KVNamespace;
};

const allowedOrigin =
  /^https:\/\/([a-z0-9-]+\.)?fastlane-e6g\.pages\.dev$|^https:\/\/fastlane\.bitsquid\.work$|^http:\/\/localhost:\d+$/;

export const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({ origin: (origin) => (allowedOrigin.test(origin) ? origin : null) }));

// CD-06: every response carries the deployed version so smoke tests can match it to the released SHA.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Fastlane-Version', c.env.VERSION);
});

app.get('/healthz', (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT, version: c.env.VERSION }),
);
