// OpenAI provider implementation
// Handles OpenAI-compatible APIs (OpenAI, Azure OpenAI, OpenRouter, etc.)

import type {
  LLMProvider,
  ProviderConfig,
  StandardCompletionRequest,
  StandardCompletionResponse,
  StandardStreamChunk,
} from './types';

const DEFAULT_TIMEOUT_MS = 30000;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | { type: string; [key: string]: unknown }[];
}

interface OpenAICompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  [key: string]: unknown;
}

interface OpenAICompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
}

/**
 * OpenAI provider implementation.
 * Compatible with OpenAI, Azure OpenAI, OpenRouter, and other OpenAI-compatible APIs.
 */
export class OpenAIProvider implements LLMProvider {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  getProviderName(): string {
    return 'openai';
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.openai.com/v1';
  }

  private transformRequest(request: StandardCompletionRequest): OpenAICompletionRequest {
    // Convert standard format to OpenAI format
    const messages: OpenAIMessage[] = request.messages.map((msg) => {
      // Handle string content
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        };
      }

      // Handle array content (multimodal)
      return {
        role: msg.role,
        content: msg.content,
      };
    });

    return {
      model: request.model,
      messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      stream: request.stream,
    };
  }

  private transformResponse(response: OpenAICompletionResponse): StandardCompletionResponse {
    const firstChoice = response.choices[0];
    if (!firstChoice) {
      throw new Error('No choices in OpenAI response');
    }

    return {
      id: response.id,
      model: response.model,
      created: response.created,
      content: firstChoice.message.content || '',
      finish_reason: firstChoice.finish_reason,
      usage: response.usage,
    };
  }

  private transformStreamChunk(chunk: OpenAIStreamChunk): StandardStreamChunk {
    const firstChoice = chunk.choices[0];
    if (!firstChoice) {
      throw new Error('No choices in OpenAI stream chunk');
    }

    return {
      id: chunk.id,
      model: chunk.model,
      delta: firstChoice.delta.content || '',
      finish_reason: firstChoice.finish_reason,
    };
  }

  async createCompletion(
    request: StandardCompletionRequest
  ): Promise<StandardCompletionResponse> {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const openaiRequest = this.transformRequest(request);

      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...openaiRequest,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as OpenAICompletionResponse;
      return this.transformResponse(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *createCompletionStream(
    request: StandardCompletionRequest
  ): AsyncGenerator<StandardStreamChunk, void, unknown> {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const openaiRequest = this.transformRequest(request);

      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...openaiRequest,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${error}`);
      }

      if (!response.body) {
        throw new Error('No response body from OpenAI');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (value) {
            buffer += decoder.decode(value, { stream: !done });
          } else if (done) {
            decoder.decode(new Uint8Array(0), { stream: false });
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const json = JSON.parse(trimmed.slice(6)) as OpenAIStreamChunk;
              yield this.transformStreamChunk(json);
            } catch {
              // Skip malformed JSON
            }
          }

          if (done) {
            if (buffer.trim()) {
              const trimmed = buffer.trim();
              if (trimmed && trimmed !== 'data: [DONE]' && trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6)) as OpenAIStreamChunk;
                  yield this.transformStreamChunk(json);
                } catch {
                  // Skip malformed JSON
                }
              }
            }
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
