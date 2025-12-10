// Anthropic provider implementation
// Handles Anthropic Claude API with message format conversion

import type {
  LLMProvider,
  ProviderConfig,
  StandardCompletionRequest,
  StandardCompletionResponse,
  StandardStreamChunk,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30000;
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | { type: string; [key: string]: unknown }[];
}

interface AnthropicCompletionRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

interface AnthropicCompletionResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text";
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamChunk {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop";
  index?: number;
  delta?: {
    type: "text_delta";
    text: string;
  };
  message?: {
    id: string;
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Anthropic provider implementation.
 * Handles Claude API with proper message format conversion.
 */
export class AnthropicProvider implements LLMProvider {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  getProviderName(): string {
    return "anthropic";
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || "https://api.anthropic.com/v1";
  }

  private transformRequest(
    request: StandardCompletionRequest
  ): AnthropicCompletionRequest {
    // Extract system message (if any) from messages array
    let systemMessage: string | undefined;
    const userAssistantMessages: AnthropicMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        // Anthropic uses a separate system parameter
        if (typeof msg.content === "string") {
          systemMessage = systemMessage
            ? `${systemMessage}\n\n${msg.content}`
            : msg.content;
        } else if (Array.isArray(msg.content)) {
          // Extract text from content array
          const textContent = msg.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
          systemMessage = systemMessage
            ? `${systemMessage}\n\n${textContent}`
            : textContent;
        }
      } else {
        // Handle string content
        if (typeof msg.content === "string") {
          userAssistantMessages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        } else {
          // Handle array content (multimodal)
          userAssistantMessages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
      }
    }

    return {
      model: request.model,
      messages: userAssistantMessages,
      system: systemMessage,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      top_p: request.top_p,
      stream: request.stream,
    };
  }

  private transformResponse(
    response: AnthropicCompletionResponse
  ): StandardCompletionResponse {
    // Extract text from content array
    const content = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      id: response.id,
      model: response.model,
      content,
      finish_reason: response.stop_reason || "stop",
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async createCompletion(
    request: StandardCompletionRequest
  ): Promise<StandardCompletionResponse> {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const anthropicRequest = this.transformRequest(request);

      const response = await fetch(`${this.getBaseUrl()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          ...anthropicRequest,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as AnthropicCompletionResponse;
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

    let messageId = "";
    let model = "";

    try {
      const anthropicRequest = this.transformRequest(request);

      const response = await fetch(`${this.getBaseUrl()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          ...anthropicRequest,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${error}`);
      }

      if (!response.body) {
        throw new Error("No response body from Anthropic");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (value) {
            buffer += decoder.decode(value, { stream: !done });
          } else if (done) {
            decoder.decode(new Uint8Array(0), { stream: false });
          }

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6)) as AnthropicStreamChunk;

              // Extract message metadata from message_start event
              if (json.type === "message_start" && json.message) {
                messageId = json.message.id;
                model = json.message.model;
              }

              // Yield text deltas
              if (
                json.type === "content_block_delta" &&
                json.delta?.type === "text_delta"
              ) {
                yield {
                  id: messageId,
                  model,
                  delta: json.delta.text,
                  finish_reason: null,
                };
              }

              // Handle message completion
              if (json.type === "message_stop") {
                yield {
                  id: messageId,
                  model,
                  delta: "",
                  finish_reason: "stop",
                };
              }
            } catch {
              // Skip malformed JSON
            }
          }

          if (done) {
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
