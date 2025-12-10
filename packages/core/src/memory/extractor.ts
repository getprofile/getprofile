// MemoryExtractor - Extracts facts and memories from conversations using LLM
// Based on the TraitEngine pattern

import type { MemoryCandidate, MemoryType } from "../types";
import { loadPrompt, DEFAULT_MEMORY_EXTRACTION_PROMPT } from "../utils/prompts";
import { createProvider, type ProviderConfig } from "../providers";
import { retryWithBackoff, logError } from "../utils/error-handling";
import { createLogger } from "../utils/logger";

const logger = createLogger({ name: "memory-extractor" });

export interface MemoryExtractorConfig {
  llm?: {
    provider?: "openai" | "anthropic" | "custom";
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
  };
  extractionEnabled?: boolean;
  /** Custom extraction prompt template. Use {{conversation}} as placeholder for conversation content. */
  customPrompt?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

/**
 * MemoryExtractor uses an LLM to extract structured memories from conversations.
 * Memories are facts, preferences, events, or contextual information about the user.
 *
 * Prompts are loaded from config/prompts/extraction.md at runtime.
 * Use customPrompt config to override the default.
 */
export class MemoryExtractor {
  private config: MemoryExtractorConfig;
  private promptTemplate: string;

  constructor(config?: MemoryExtractorConfig) {
    this.config = config ?? {};

    // Load prompt template from file or use custom/fallback
    this.promptTemplate =
      this.config.customPrompt ||
      loadPrompt("extraction.md", DEFAULT_MEMORY_EXTRACTION_PROMPT);
  }

  /**
   * Extract memories from a conversation using LLM.
   * Returns a list of memory candidates to be stored.
   *
   * Note: Only extracts memories from user messages, not assistant messages.
   */
  async extract(
    messages: ChatMessage[],
    messageIds?: string[]
  ): Promise<MemoryCandidate[]> {
    if (this.config.extractionEnabled === false) {
      return [];
    }

    // Filter to only user messages - we don't extract memories from assistant responses
    const userMessages = messages.filter((m) => m.role === "user");

    if (userMessages.length === 0) {
      return [];
    }

    // Check if we have an API key configured
    const apiKey =
      this.config.llm?.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn("No LLM API key configured, skipping extraction");
      return [];
    }

    try {
      // Build the extraction prompt (only from user messages)
      const prompt = this.buildExtractionPrompt(userMessages);

      // Call LLM with retry logic for transient failures
      const response = await retryWithBackoff(() => this.callLLM(prompt), {
        maxRetries: 2,
        initialDelayMs: 1000,
        onRetry: (attempt, error) => {
          logError("MemoryExtractor", error, {
            attempt,
            messageCount: userMessages.length,
            totalMessages: messages.length,
          });
        },
      });

      // Parse the response
      const memories = this.parseExtractionResponse(response);

      // Add source message IDs
      return memories.map((m) => ({
        ...m,
        sourceMessageIds: messageIds || [],
      }));
    } catch (error) {
      logError("MemoryExtractor", error, {
        messageCount: userMessages.length,
        totalMessages: messages.length,
        messageIds: messageIds || [],
      });
      return [];
    }
  }

  // === Private helpers ===

  private buildExtractionPrompt(messages: ChatMessage[]): string {
    const conversationContext = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    // Replace conversation placeholder in the loaded template
    return this.promptTemplate.replace("{{conversation}}", conversationContext);
  }

  private async callLLM(prompt: string): Promise<string> {
    // Get API key
    const apiKey =
      this.config.llm?.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("No LLM API key configured");
    }

    // Create provider
    const providerConfig: ProviderConfig = {
      provider: this.config.llm?.provider || "openai",
      apiKey,
      baseUrl: this.config.llm?.baseUrl,
      model: this.config.llm?.model,
      timeoutMs: this.config.llm?.timeoutMs ?? 30_000,
    };

    const provider = createProvider(providerConfig);

    // Make request using provider
    const model = this.config.llm?.model || "gpt-5-mini";
    const response = await provider.createCompletion({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a memory extraction assistant. Always respond with valid JSON arrays only.",
        },
        { role: "user", content: prompt },
      ],
    });

    return response.content || "[]";
  }

  private parseExtractionResponse(response: string): MemoryCandidate[] {
    try {
      // Try to extract JSON from the response
      // LLM might wrap it in markdown code blocks
      let jsonStr = response.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1]!.trim();
      }

      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        logger.warn(
          { type: typeof parsed },
          "Expected array in extraction response"
        );
        return [];
      }

      // Validate and filter memories
      const validated = parsed.filter(
        (item: unknown): item is Record<string, unknown> => {
          if (typeof item !== "object" || item === null) return false;
          const m = item as Record<string, unknown>;
          return (
            typeof m.content === "string" &&
            typeof m.type === "string" &&
            ["fact", "preference", "event", "context"].includes(m.type) &&
            typeof m.importance === "number" &&
            m.importance >= 0 &&
            m.importance <= 1
          );
        }
      );

      // Map to MemoryCandidate type
      return validated.map(
        (m): MemoryCandidate => ({
          content: m.content as string,
          type: m.type as MemoryType,
          importance: m.importance as number,
          sourceMessageIds: [],
        })
      );
    } catch (error) {
      const previewLength = 200;
      const preview = response.slice(0, previewLength);
      logger.error(
        {
          err: error,
          responseLength: response.length,
          preview:
            response.length > previewLength
              ? `${preview}... [truncated]`
              : response,
        },
        "Failed to parse extraction response"
      );
      return [];
    }
  }
}
