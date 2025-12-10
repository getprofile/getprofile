// Upstream LLM client for forwarding requests
// Supports OpenAI, Anthropic, and other providers

import { createProvider, type ProviderConfig as CoreProviderConfig, type StandardMessage } from '@getprofile/core/providers';
import { getConfig } from '@getprofile/config';

const DEFAULT_TIMEOUT_MS = 30000;

export type ChatMessageContent =
  | string
  | ChatMessageContentPart[];

export type ChatMessageContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
    type: 'image_url';
    image_url: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }
  | {
      type: string;
      [key: string]: unknown;
    };

export interface UpstreamConfig {
  provider?: 'openai' | 'anthropic' | 'custom';
  baseUrl?: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatMessageContent;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }[];
}

/**
 * Upstream LLM client for forwarding requests.
 * Uses provider abstraction to support multiple LLM providers.
 */
export class UpstreamClient {
  private provider: ReturnType<typeof createProvider>;
  private config: UpstreamConfig & { provider: 'openai' | 'anthropic' | 'custom' };

  constructor(config: UpstreamConfig) {
    this.config = {
      ...config,
      provider: config.provider || 'openai',
    };

    // Create provider instance
    const providerConfig: CoreProviderConfig = {
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
    };

    this.provider = createProvider(providerConfig);
  }

  /**
   * Convert OpenAI-format messages to standard format
   */
  private convertToStandardMessages(messages: ChatMessage[]): StandardMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content as StandardMessage['content'],
    }));
  }

  /**
   * Create a non-streaming chat completion.
   */
  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    try {
      const standardRequest = {
        model: request.model,
        messages: this.convertToStandardMessages(request.messages),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        stream: false,
      };

      const response = await this.provider.createCompletion(standardRequest);

      // Convert standard response back to OpenAI format
      return {
        id: response.id,
        object: 'chat.completion',
        created: response.created ?? Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
          },
          finish_reason: response.finish_reason,
        }],
        usage: response.usage,
      };
    } catch (error) {
      // Preserve error context from provider errors
      if (error instanceof UpstreamError) {
        throw error;
      }
      if (error instanceof Error) {
        // Check if it's a fetch error with status code
        const fetchError = error as Error & { status?: number; statusText?: string; body?: string };
        if (fetchError.status) {
          throw new UpstreamError(
            error.message,
            fetchError.status,
            fetchError.body || fetchError.statusText || error.message
          );
        }
        throw new UpstreamError(error.message, 0, error.message);
      }
      throw new UpstreamError('Unknown error occurred', 0, String(error));
    }
  }

  /**
   * Create a streaming chat completion.
   * Returns an async iterator of chunks.
   */
  async *createChatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const standardRequest = {
        model: request.model,
        messages: this.convertToStandardMessages(request.messages),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        stream: true,
      };

      // Stream from provider
      for await (const chunk of this.provider.createCompletionStream(standardRequest)) {
        // Convert standard chunk back to OpenAI format
        yield {
          id: chunk.id,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: chunk.model,
          choices: [{
            index: 0,
            delta: {
              role: 'assistant',
              content: chunk.delta,
            },
            finish_reason: chunk.finish_reason,
          }],
        };
      }
    } catch (error) {
      // Preserve error context from provider errors
      if (error instanceof UpstreamError) {
        throw error;
      }
      if (error instanceof Error) {
        // Check if it's a fetch error with status code
        const fetchError = error as Error & { status?: number; statusText?: string; body?: string };
        if (fetchError.status) {
          throw new UpstreamError(
            error.message,
            fetchError.status,
            fetchError.body || fetchError.statusText || error.message
          );
        }
        throw new UpstreamError(error.message, 0, error.message);
      }
      throw new UpstreamError('Unknown error occurred', 0, String(error));
    }
  }

  /**
   * List available models from upstream.
   * Note: Not all providers support this endpoint (e.g., Anthropic doesn't).
   */
  async listModels(): Promise<{ data: { id: string; object: string }[] }> {
    if (this.config.provider !== 'openai' && this.config.provider !== 'custom') {
      throw new Error('listModels is not supported for this provider.');
    }

    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new UpstreamError('Failed to list models', response.status, body);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new UpstreamError(error.message, 0, error.message);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Error from upstream provider.
 */
export class UpstreamError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.body = body;
  }
}

// Default upstream client (initialized on first use)
let defaultClient: UpstreamClient | null = null;

/**
 * Get the default upstream client.
 * Initializes from config file or environment variables if not already created.
 *
 * Configuration priority:
 * 1. config/getprofile.json (upstream section)
 * 2. Environment variables (UPSTREAM_*)
 * 3. Fallback to LLM config
 */
export function getUpstreamClient(): UpstreamClient {
  if (!defaultClient) {
    // Try to load from config
    let config;
    try {
      config = getConfig();
    } catch {
      // Fallback to environment variables
      config = null;
    }

    // Determine provider
    let provider: 'openai' | 'anthropic' | 'custom' = 'openai';
    if (config?.upstream?.provider) {
      provider = config.upstream.provider;
    } else if (process.env.UPSTREAM_PROVIDER) {
      const envProvider = process.env.UPSTREAM_PROVIDER.toLowerCase();
      if (envProvider === 'openai' || envProvider === 'anthropic' || envProvider === 'custom') {
        provider = envProvider;
      }
    }

    // Get API key with fallbacks
    const apiKey =
      config?.upstream?.apiKey ||
      process.env.UPSTREAM_API_KEY ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'API key required. Set UPSTREAM_API_KEY, LLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY, or configure in config/getprofile.json'
      );
    }

    // Get base URL
    const baseUrl = config?.upstream?.baseUrl || process.env.UPSTREAM_BASE_URL;

    defaultClient = new UpstreamClient({ provider, baseUrl, apiKey });
  }

  return defaultClient;
}

/**
 * Create a new upstream client with custom config.
 */
export function createUpstreamClient(config: UpstreamConfig): UpstreamClient {
  return new UpstreamClient(config);
}
