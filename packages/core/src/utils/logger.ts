// Structured logging with Pino
// Provides consistent logging across the codebase

import pino from 'pino';

/**
 * Create a logger instance.
 * In development, uses pretty printing. In production, uses JSON.
 */
export function createLogger(options?: {
  name?: string;
  level?: string;
  pretty?: boolean;
}): pino.Logger {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const level = options?.level || process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
  const name = options?.name || 'getprofile';

  const baseLogger = pino({
    name,
    level,
    ...(isDevelopment && options?.pretty !== false
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });

  return baseLogger;
}

/**
 * Default logger instance.
 * Use this for most logging needs.
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context.
 * Useful for request-scoped logging.
 */
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}
