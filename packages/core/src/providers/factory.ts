// Provider factory
// Creates the appropriate LLM provider based on configuration

import type { LLMProvider, ProviderConfig } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

/**
 * Create an LLM provider based on configuration.
 * Supports OpenAI, Anthropic, and OpenAI-compatible custom providers.
 *
 * @param config - Provider configuration
 * @returns LLMProvider instance
 * @throws Error if provider is not supported
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);

    case 'anthropic':
      return new AnthropicProvider(config);

    case 'custom':
      // Custom providers are assumed to be OpenAI-compatible
      return new OpenAIProvider(config);

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Create a provider from environment variables.
 * Falls back to sensible defaults.
 *
 * Environment variables used:
 * - LLM_PROVIDER or OPENAI_API_KEY (legacy)
 * - LLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY
 * - LLM_BASE_URL
 * - LLM_MODEL
 */
export function createProviderFromEnv(): LLMProvider {
  // Determine provider
  let provider: 'openai' | 'anthropic' | 'custom' = 'openai';

  if (process.env.LLM_PROVIDER) {
    const envProvider = process.env.LLM_PROVIDER.toLowerCase();
    if (envProvider === 'openai' || envProvider === 'anthropic' || envProvider === 'custom') {
      provider = envProvider;
    }
  }

  // Determine API key (with provider-specific fallbacks)
  let apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    if (provider === 'anthropic') {
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else {
      apiKey = process.env.OPENAI_API_KEY;
    }
  }

  if (!apiKey) {
    throw new Error(
      'LLM API key not found. Set LLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY environment variable.'
    );
  }

  // Get base URL and model
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;

  return createProvider({
    provider,
    apiKey,
    baseUrl,
    model,
  });
}
