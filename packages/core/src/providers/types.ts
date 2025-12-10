// Provider abstraction types
// Defines standardized interfaces for different LLM providers

export type MessageRole = 'system' | 'user' | 'assistant';

export type MessageContent =
  | string
  | {
      type: 'text';
      text: string;
    }[]
  | {
      type: 'image_url';
      image_url: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
      };
    }[];

export interface StandardMessage {
  role: MessageRole;
  content: MessageContent;
}

export interface StandardCompletionRequest {
  model: string;
  messages: StandardMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export interface StandardCompletionResponse {
  id: string;
  model: string;
  created?: number;
  content: string;
  finish_reason: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StandardStreamChunk {
  id: string;
  model: string;
  delta: string;
  finish_reason: string | null;
}

export interface ProviderConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Base interface for all LLM providers.
 * Implementations handle provider-specific API formats.
 */
export interface LLMProvider {
  /**
   * Create a non-streaming chat completion
   */
  createCompletion(
    request: StandardCompletionRequest
  ): Promise<StandardCompletionResponse>;

  /**
   * Create a streaming chat completion
   */
  createCompletionStream(
    request: StandardCompletionRequest
  ): AsyncGenerator<StandardStreamChunk, void, unknown>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}
