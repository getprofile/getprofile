import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from './auth';

describe('authMiddleware', () => {
  let app: Hono;
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env.GETPROFILE_API_KEY;
    delete process.env.GETPROFILE_API_KEY;
    app = new Hono();
    app.use('/api/*', authMiddleware);
    app.get('/api/test', (c) => c.json({ success: true }));
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GETPROFILE_API_KEY = originalEnv;
    } else {
      delete process.env.GETPROFILE_API_KEY;
    }
  });

  it('should allow requests when no API key is configured', async () => {
    const res = await app.request('/api/test');
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('should return 401 if API key is configured but no Authorization header', async () => {
    process.env.GETPROFILE_API_KEY = 'test-key-123';

    const res = await app.request('/api/test');
    
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('missing_api_key');
  });

  it('should return 401 if Authorization header is not Bearer', async () => {
    process.env.GETPROFILE_API_KEY = 'test-key-123';

    const res = await app.request('/api/test', {
      headers: {
        Authorization: 'Basic abc123',
      },
    });
    
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('missing_api_key');
  });

  it('should return 401 if API key does not match', async () => {
    process.env.GETPROFILE_API_KEY = 'test-key-123';

    const res = await app.request('/api/test', {
      headers: {
        Authorization: 'Bearer wrong-key',
      },
    });
    
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_api_key');
  });

  it('should allow requests when API key matches', async () => {
    process.env.GETPROFILE_API_KEY = 'test-key-123';

    const res = await app.request('/api/test', {
      headers: {
        Authorization: 'Bearer test-key-123',
      },
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
