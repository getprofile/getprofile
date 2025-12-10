// Authentication middleware for GetProfile Proxy
// Simple API key check from environment variable (optional)

import type { Context, Next } from "hono";
import { timingSafeEqual } from "crypto";
import { sendError } from "../lib/errors";

function isApiKeyValid(providedKey: string, apiKey: string) {
  const providedKeyBuffer = Buffer.from(providedKey, "utf8");
  const apiKeyBuffer = Buffer.from(apiKey, "utf8");

  return (
    providedKeyBuffer.length === apiKeyBuffer.length &&
    timingSafeEqual(providedKeyBuffer, apiKeyBuffer)
  );
}

/**
 * Simple authentication middleware.
 *
 * If GETPROFILE_API_KEY is set, validates the Authorization header matches it.
 * If not set, allows all requests (useful for local development).
 */
export async function authMiddleware(c: Context, next: Next) {
  const apiKey = process.env.GETPROFILE_API_KEY;

  // If no API key is configured, allow all requests
  if (!apiKey) {
    await next();
    return;
  }

  // If API key is configured, validate it
  const authHeader = c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return sendError(
      c,
      401,
      "Missing or invalid Authorization header",
      "authentication_error",
      "missing_api_key"
    );
  }

  const providedKey = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!isApiKeyValid(providedKey, apiKey)) {
    return sendError(
      c,
      401,
      "Invalid API key",
      "authentication_error",
      "invalid_api_key"
    );
  }

  await next();
}
