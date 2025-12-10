import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimitMiddleware } from './rate-limit';

describe('rateLimitMiddleware', () => {
  const originalLimit = process.env.GETPROFILE_RATE_LIMIT;

  beforeEach(() => {
    process.env.GETPROFILE_RATE_LIMIT = '2';
  });

  afterEach(() => {
    if (originalLimit === undefined) {
      delete process.env.GETPROFILE_RATE_LIMIT;
    } else {
      process.env.GETPROFILE_RATE_LIMIT = originalLimit;
    }
  });

  function createApp() {
    const app = new Hono();
    app.use('*', rateLimitMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('allows requests under the limit', async () => {
    const app = createApp();

    const res1 = await app.request('/test');
    const res2 = await app.request('/test');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('blocks requests over the limit', async () => {
    const app = createApp();

    await app.request('/test');
    await app.request('/test');
    const res3 = await app.request('/test');

    expect(res3.status).toBe(429);
    const body = await res3.json();
    expect(body.error.code).toBe('rate_limit_exceeded');
  });
});
