// Standardized error response utilities
// Ensures consistent error format across all endpoints (OpenAI-compatible)

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_denied_error'
  | 'not_found_error'
  | 'rate_limit_error'
  | 'upstream_error'
  | 'internal_error';

export interface ErrorResponse {
  error: {
    message: string;
    type: ErrorType;
    code?: string;
    param?: string;
    details?: unknown;
  };
}

/**
 * Create a standardized error response.
 * Follows OpenAI-compatible error format.
 */
export function createErrorResponse(
  message: string,
  type: ErrorType = 'invalid_request_error',
  code?: string,
  param?: string,
  details?: unknown
): ErrorResponse {
  return {
    error: {
      message,
      type,
      ...(code && { code }),
      ...(param && { param }),
      ...(details && { details }),
    },
  };
}

/**
 * Send an error response with the standard format.
 */
export function sendError(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  type: ErrorType = 'invalid_request_error',
  code?: string,
  param?: string,
  details?: unknown
) {
  return c.json(createErrorResponse(message, type, code, param, details), status);
}

/**
 * Map HTTP status codes to error types.
 */
export function statusToErrorType(status: number): ErrorType {
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_denied_error';
  if (status === 404) return 'not_found_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'internal_error';
  return 'invalid_request_error';
}

/**
 * Handle and format unknown errors.
 */
export function handleError(error: unknown): { message: string; type: ErrorType; details?: unknown } {
  if (error instanceof Error) {
    // Check for known error types
    if (error.name === 'UpstreamError') {
      const upstreamError = error as unknown as { status: number; body: string };
      return {
        message: 'Upstream provider error',
        type: 'upstream_error',
        details: upstreamError.body,
      };
    }

    return {
      message: error.message || 'Internal server error',
      type: 'internal_error',
    };
  }

  return {
    message: 'Internal server error',
    type: 'internal_error',
    details: String(error),
  };
}
