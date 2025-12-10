// Tests for error handling utilities

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createErrorContext, logError, isRetryableError, retryWithBackoff } from './error-handling';
import { logger } from './logger';

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    child: vi.fn(() => ({
      error: vi.fn(),
    })),
  },
}));

describe('Error Handling Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createErrorContext', () => {
    it('should create error context from Error object', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';
      const context = createErrorContext(error, { profileId: '123' });

      expect(context.error).toBe('Test error');
      expect(context.stack).toBeDefined();
      expect(context.profileId).toBe('123');
      expect(context.timestamp).toBeDefined();
    });

    it('should create error context from string', () => {
      const context = createErrorContext('String error', { operation: 'test' });
      expect(context.error).toBe('String error');
      expect(context.operation).toBe('test');
    });

    it('should create error context from unknown type', () => {
      const context = createErrorContext({ code: 500 }, {});
      expect(context.error).toBe('[object Object]');
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const error = new Error('Test error');
      logError('TestComponent', error, { profileId: '123' });

      expect(logger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'TestComponent',
          profileId: '123',
        })
      );
    });

    it('should log non-Error objects', () => {
      logError('TestComponent', 'String error', {});
      expect(logger.child).toHaveBeenCalled();
    });
  });

  describe('isRetryableError', () => {
    it('should identify timeout errors as retryable', () => {
      const error = new Error('Request timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify network errors as retryable', () => {
      const error = new Error('Network error: ECONNREFUSED');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify rate limit errors as retryable', () => {
      const error = new Error('Rate limit exceeded');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const error = new Error('Invalid API key');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isRetryableError('string')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockResolvedValue('success');
      const result = await retryWithBackoff(fn, { maxRetries: 2 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const error = new Error('Request timeout');
      const fn = vi.fn().mockRejectedValue(error);
      await expect(retryWithBackoff(fn, { maxRetries: 2 })).rejects.toThrow('Request timeout');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Invalid API key');
      const fn = vi.fn().mockRejectedValue(error);
      await expect(retryWithBackoff(fn)).rejects.toThrow('Invalid API key');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockResolvedValue('success');
      await retryWithBackoff(fn, { onRetry });
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockResolvedValue('success');

      // Mock setTimeout to track delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((fn: () => void, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0) as unknown as NodeJS.Timeout;
      });

      await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 100,
        backoffMultiplier: 2,
      });

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      global.setTimeout = originalSetTimeout;
    });
  });
});
