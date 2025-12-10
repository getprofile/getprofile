// Upstream client helpers for chat route
// Extracted to improve testability

import { getUpstreamClient, createUpstreamClient, type UpstreamClient } from '../lib/upstream';

/**
 * Get or create upstream client with optional per-request overrides.
 * Checks for provider-specific headers and creates custom client if needed.
 */
export async function getUpstreamClientForRequest(
  c: { req: { header: (name: string) => string | undefined } }
): Promise<UpstreamClient> {
  // Check for provider-specific headers (X-Upstream-Provider, X-Upstream-Key, X-Upstream-Base-URL)
  const upstreamProvider = c.req.header('x-upstream-provider') as 'openai' | 'anthropic' | 'custom' | undefined;
  const upstreamKey = c.req.header('x-upstream-key');
  const upstreamBaseUrl = c.req.header('x-upstream-base-url');

  if (upstreamProvider || upstreamKey || upstreamBaseUrl) {
    // Create custom upstream client with header overrides
    return createUpstreamClient({
      provider: upstreamProvider,
      apiKey: upstreamKey || process.env.UPSTREAM_API_KEY || process.env.LLM_API_KEY || '',
      baseUrl: upstreamBaseUrl,
    });
  } else {
    // Use default upstream client
    return getUpstreamClient();
  }
}
