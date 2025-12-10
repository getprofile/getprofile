// Simple in-memory rate limiter (per IP/identifier)
// Not suitable for distributed deployment; placeholder for Phase 2/3

import type { Context, Next } from 'hono';
import { createErrorResponse } from '../lib/errors';
import { createLogger } from '@getprofile/core';

const logger = createLogger({ name: 'rate-limit' });

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 300_000; // Clean up old buckets every 5 minutes

// Cleanup old buckets periodically to prevent memory leaks
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, bucket] of buckets.entries()) {
      // Remove buckets that expired more than 1 window ago
      if (now >= bucket.resetAt + WINDOW_MS) {
        buckets.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned up expired buckets');
    }
    // Prevent unbounded growth: if we have too many buckets, remove oldest
    if (buckets.size > 10000) {
      const sorted = Array.from(buckets.entries())
        .sort((a, b) => a[1].resetAt - b[1].resetAt);
      const toRemove = sorted.slice(0, 1000);
      for (const [key] of toRemove) {
        buckets.delete(key);
      }
      logger.warn({ removed: toRemove.length, totalBuckets: buckets.size }, 'Removed oldest buckets to prevent memory growth');
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup on module load
startCleanup();

// Cleanup on process exit
process.on('SIGTERM', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
});

process.on('SIGINT', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
});

function parseLimit(): number {
  const raw = process.env.GETPROFILE_RATE_LIMIT;
  if (!raw) return 60;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
}

function getKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;
  return 'anonymous';
}

export async function rateLimitMiddleware(c: Context, next: Next) {
  const limit = parseLimit();
  if (limit === 0) {
    await next();
    return;
  }

  const key = getKey(c);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      const errorResponse = createErrorResponse('Too many requests', 'rate_limit_error', 'rate_limit_exceeded');
      return c.json(errorResponse, 429, {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      });
    }
  }

  await next();
}
