// Common error handling utilities
// Reduces code duplication in error handling patterns

import { logger } from './logger';

export interface ErrorContext {
  error: string;
  stack?: string;
  [key: string]: unknown;
}

/**
 * Create a structured error context object for logging.
 * This standardizes error logging across the codebase.
 */
export function createErrorContext(
  error: unknown,
  additionalContext?: Record<string, unknown>
): ErrorContext {
  const baseContext: ErrorContext = {
    error: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  };

  if (error instanceof Error && error.stack) {
    baseContext.stack = error.stack;
  }

  return {
    ...baseContext,
    ...additionalContext,
  };
}

/**
 * Log an error with structured context.
 * Uses Pino for structured logging.
 */
export function logError(
  prefix: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorContext = createErrorContext(error, context);
  const childLogger = logger.child({ component: prefix, ...context });
  
  if (error instanceof Error) {
    childLogger.error({ err: error }, error.message);
  } else {
    childLogger.error(errorContext, 'Error occurred');
  }
  
  // TODO: In production, send to error tracking service (Sentry, etc.)
}

/**
 * Check if an error is retryable (transient failure).
 * Common patterns for retryable errors.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'timeout',
    'network',
    'econnrefused',
    'etimedout',
    'econnreset',
    'rate limit',
    'too many requests',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

/**
 * Retry a function with exponential backoff.
 * Useful for transient failures in LLM calls or network requests.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError;
}
