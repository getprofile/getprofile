// TraitEngine - Handles trait extraction and management
// Uses LLM to extract structured traits from conversations
// Schemas are loaded from embedded defaults or provided per-request

import {
  getTraitsForProfile,
  upsertTrait,
  deleteTraitByKey,
} from "@getprofile/db";
import type { Trait, TraitSchema, TraitUpdate } from "../types";
import {
  getDefaultTraitSchemas,
  buildSchemaContext,
  formatExistingTraits,
} from "./schema";
import { loadPrompt, DEFAULT_TRAIT_EXTRACTION_PROMPT } from "../utils/prompts";
import { createProvider, type ProviderConfig } from "../providers";
import { TRAIT_DEFAULTS } from "../constants";
import { retryWithBackoff, logError } from "../utils/error-handling";
import { createLogger } from "../utils/logger";

const logger = createLogger({ name: "trait-engine" });

export interface TraitEngineConfig {
  // LLM configuration for extraction
  llm?: {
    provider?: "openai" | "anthropic" | "custom";
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
  };
  // Whether extraction is enabled
  extractionEnabled?: boolean;
  /**
   * Custom trait extraction prompt template.
   * Placeholders: {{schemas}}, {{current_traits}}, {{conversation}}
   */
  customPrompt?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

/**
 * TraitEngine handles trait extraction and management.
 * It uses an LLM to extract structured traits from conversations.
 *
 * Schema Loading Strategy:
 * 1. Use per-request schemas if provided (via request body or headers)
 * 2. Fall back to embedded default schemas
 *
 * Prompts are loaded from config/prompts/trait-extraction.md at runtime.
 * Use customPrompt config to override the default.
 *
 * Schemas are defined in JSON files (config/traits/default.traits.json)
 * and embedded at build time. For custom schemas, developers can:
 * - Provide schemas per-request (dynamic)
 * - Or modify the config files and rebuild
 */
export class TraitEngine {
  private schemas: Map<string, TraitSchema>;
  private config: TraitEngineConfig;
  private promptTemplate: string;

  constructor(config?: TraitEngineConfig) {
    this.config = config ?? {};
    this.schemas = new Map();

    // Load embedded default schemas
    this.loadDefaultSchemas();

    // Load prompt template from file or use custom/fallback
    this.promptTemplate =
      this.config.customPrompt ||
      loadPrompt("trait-extraction.md", DEFAULT_TRAIT_EXTRACTION_PROMPT);
  }

  /**
   * Load the embedded default trait schemas.
   */
  private loadDefaultSchemas(): void {
    const defaults = getDefaultTraitSchemas();
    for (const schema of defaults) {
      this.schemas.set(schema.key, schema);
    }
  }

  /**
   * Set schemas for extraction (used for per-request overrides).
   * This replaces the current schemas with the provided ones.
   */
  setSchemas(schemas: TraitSchema[]): void {
    this.schemas.clear();
    for (const schema of schemas) {
      this.schemas.set(schema.key, schema);
    }
  }

  /**
   * Reset schemas to defaults.
   */
  resetToDefaults(): void {
    this.schemas.clear();
    this.loadDefaultSchemas();
  }

  /**
   * Get all loaded schemas.
   */
  getSchemas(): TraitSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get a specific schema by key.
   */
  getSchema(key: string): TraitSchema | undefined {
    return this.schemas.get(key);
  }

  /**
   * Get traits for a profile from the database.
   */
  async getTraits(profileId: string): Promise<Trait[]> {
    const dbTraits = await getTraitsForProfile(profileId);
    return dbTraits.map((t) => this.mapDbTrait(t));
  }

  /**
   * Extract traits from a conversation using LLM.
   * Returns a list of trait updates to apply.
   *
   * @param messages - Conversation messages to analyze
   * @param existingTraits - Current traits for context and conflict resolution
   * @param customSchemas - Optional per-request schema overrides
   * @returns Array of trait updates (create/update/delete actions)
   *
   * @example
   * ```typescript
   * const engine = new TraitEngine({ llm: { apiKey: 'sk-...' } });
   * const updates = await engine.extractTraits(
   *   [{ role: 'user', content: "Hi, I'm Alex, a senior Python developer" }],
   *   []
   * );
   * // Returns: [
   * //   { key: 'name', value: 'Alex', confidence: 0.95, action: 'create' },
   * //   { key: 'expertise_level', value: 'expert', confidence: 0.8, action: 'create' }
   * // ]
   * ```
   */
  async extractTraits(
    messages: ChatMessage[],
    existingTraits: Trait[],
    customSchemas?: TraitSchema[]
  ): Promise<TraitUpdate[]> {
    if (this.config.extractionEnabled === false) {
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
      // Build the extraction prompt (use custom schemas if provided)
      const prompt = this.buildExtractionPrompt(messages, existingTraits, customSchemas);

      // Call LLM with retry logic for transient failures
      const response = await retryWithBackoff(() => this.callLLM(prompt), {
        maxRetries: 2,
        initialDelayMs: 1000,
        onRetry: (attempt, error) => {
          logError("TraitEngine", error, {
            attempt,
            messageCount: messages.length,
            existingTraitCount: existingTraits.length,
          });
        },
      });

      // Parse the response
      const updates = this.parseExtractionResponse(response);

      // Filter by confidence thresholds (use custom schemas if provided)
      return this.filterByConfidenceThreshold(updates, customSchemas);
    } catch (error) {
      logError("TraitEngine", error, {
        messageCount: messages.length,
        existingTraitCount: existingTraits.length,
      });
      return [];
    }
  }

  /**
   * Apply trait updates to the database.
   */
  async applyUpdates(
    profileId: string,
    updates: TraitUpdate[],
    customSchemas?: TraitSchema[]
  ): Promise<Trait[]> {
    const results: Trait[] = [];

    // Build schema lookup map
    const schemaMap = new Map<string, TraitSchema>();
    if (customSchemas) {
      for (const schema of customSchemas) {
        schemaMap.set(schema.key, schema);
      }
    } else {
      for (const schema of this.schemas.values()) {
        schemaMap.set(schema.key, schema);
      }
    }

    for (const update of updates) {
      try {
        if (update.action === "delete") {
          await deleteTraitByKey(profileId, update.key);
        } else {
          // create or update
          const schema = schemaMap.get(update.key);
          const dbTrait = await upsertTrait({
            profileId,
            key: update.key,
            category: schema?.category ?? null,
            valueType: schema?.valueType ?? "string",
            valueJson: update.value,
            confidence: update.confidence,
            source: "extracted",
          });
          results.push(this.mapDbTrait(dbTrait));
        }
      } catch (error) {
        logger.error(
          { err: error, key: update.key, profileId },
          "Failed to apply trait update"
        );
      }
    }

    return results;
  }

  /**
   * Extract and apply traits in one operation.
   * This is the main entry point for trait extraction.
   *
   * @param profileId - Profile ID to extract traits for
   * @param messages - Conversation messages to analyze
   * @param customSchemas - Optional per-request schema overrides
   * @returns Array of trait updates that were applied
   */
  async extractAndApply(
    profileId: string,
    messages: ChatMessage[],
    customSchemas?: TraitSchema[]
  ): Promise<TraitUpdate[]> {
    // Get existing traits
    const existingTraits = await this.getTraits(profileId);

    // Extract new traits (with custom schemas if provided)
    const updates = await this.extractTraits(messages, existingTraits, customSchemas);

    // Apply updates (with custom schemas if provided)
    if (updates.length > 0) {
      await this.applyUpdates(profileId, updates, customSchemas);
    }

    return updates;
  }

  /**
   * Build injection context from traits for prompt enrichment.
   * Uses the injection templates from schemas and sorts by priority.
   *
   * @param traits - User traits to format for injection
   * @param customSchemas - Optional per-request schema overrides
   * @returns Formatted text ready to inject into system prompt
   *
   * @example
   * ```typescript
   * const engine = new TraitEngine();
   * const traits = [
   *   { key: 'name', value: 'Alex', confidence: 0.95, ... },
   *   { key: 'communication_style', value: 'technical', confidence: 0.8, ... }
   * ];
   * const context = engine.buildInjectionContext(traits);
   * // Returns:
   * // "User's name is Alex.
   * //  User prefers technical communication style."
   * ```
   */
  buildInjectionContext(traits: Trait[], customSchemas?: TraitSchema[]): string {
    const lines: { priority: number; text: string }[] = [];

    // Build schema lookup map
    const schemaMap = new Map<string, TraitSchema>();
    if (customSchemas) {
      for (const schema of customSchemas) {
        schemaMap.set(schema.key, schema);
      }
    } else {
      for (const schema of this.schemas.values()) {
        schemaMap.set(schema.key, schema);
      }
    }

    for (const trait of traits) {
      const schema = schemaMap.get(trait.key);
      if (!schema?.injection.enabled) continue;

      // Filter out low-confidence traits
      const threshold = schema.extraction.confidenceThreshold;
      if (
        trait.confidence <
        threshold * TRAIT_DEFAULTS.INJECTION_CONFIDENCE_MULTIPLIER
      )
        continue;

      // Format the value
      const valueStr =
        typeof trait.value === "object"
          ? Array.isArray(trait.value)
            ? (trait.value as string[]).join(", ")
            : JSON.stringify(trait.value)
          : String(trait.value);

      // Apply template
      const template = schema.injection.template || `${trait.key}: {{value}}`;
      const text = template.replace("{{value}}", valueStr);

      lines.push({
        priority: schema.injection.priority,
        text,
      });
    }

    // Sort by priority (higher first) and join
    return lines
      .sort((a, b) => b.priority - a.priority)
      .map((l) => l.text)
      .join("\n");
  }

  // === Private helpers ===

  private buildExtractionPrompt(
    messages: ChatMessage[],
    existingTraits: Trait[],
    customSchemas?: TraitSchema[]
  ): string {
    // Use custom schemas if provided, otherwise use instance schemas
    const schemas = customSchemas || this.getSchemas();
    const schemaContext = buildSchemaContext(schemas);
    const traitsContext = formatExistingTraits(
      existingTraits.map((t) => ({
        key: t.key,
        value: t.value,
        confidence: t.confidence,
      }))
    );
    const conversationContext = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    // Replace placeholders in the loaded template
    // Note: trait-extraction.md uses {{trait_schema}} and we provide {{schemas}}
    return this.promptTemplate
      .replace("{{trait_schema}}", schemaContext)
      .replace("{{schemas}}", schemaContext)
      .replace("{{current_traits}}", traitsContext)
      .replace("{{conversation}}", conversationContext);
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
      timeoutMs: this.config.llm?.timeoutMs ?? 15000,
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
            "You are a trait extraction assistant. Always respond with valid JSON arrays only.",
        },
        { role: "user", content: prompt },
      ],
    });

    return response.content || "[]";
  }

  private parseExtractionResponse(response: string): TraitUpdate[] {
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

      // Validate each update
      return parsed.filter((update: unknown): update is TraitUpdate => {
        if (typeof update !== "object" || update === null) return false;
        const u = update as Record<string, unknown>;
        return (
          typeof u.key === "string" &&
          u.value !== undefined &&
          typeof u.confidence === "number" &&
          ["create", "update", "delete"].includes(u.action as string)
        );
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          responseLength: response.length,
          preview:
            response.length > 500
              ? `${response.slice(0, 500)}...<truncated>`
              : response,
        },
        "Failed to parse extraction response"
      );
      return [];
    }
  }

  private filterByConfidenceThreshold(updates: TraitUpdate[], customSchemas?: TraitSchema[]): TraitUpdate[] {
    // Build schema lookup map
    const schemaMap = new Map<string, TraitSchema>();
    if (customSchemas) {
      for (const schema of customSchemas) {
        schemaMap.set(schema.key, schema);
      }
    } else {
      for (const schema of this.schemas.values()) {
        schemaMap.set(schema.key, schema);
      }
    }

    return updates.filter((update) => {
      const schema = schemaMap.get(update.key);
      if (!schema) {
        // Unknown trait, skip
        return false;
      }

      const threshold = schema.extraction.confidenceThreshold;
      return update.confidence >= threshold;
    });
  }

  private mapDbTrait(dbTrait: {
    id: string;
    profileId: string;
    key: string;
    category: string | null;
    valueType: string;
    valueJson: unknown;
    confidence: number | null;
    source: string | null;
    sourceMessageIds: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Trait {
    return {
      id: dbTrait.id,
      profileId: dbTrait.profileId,
      key: dbTrait.key,
      category: dbTrait.category,
      valueType: dbTrait.valueType as Trait["valueType"],
      value: dbTrait.valueJson,
      confidence: dbTrait.confidence ?? TRAIT_DEFAULTS.DEFAULT_CONFIDENCE,
      source: (dbTrait.source as Trait["source"]) || "extracted",
      sourceMessageIds: (dbTrait.sourceMessageIds as string[]) || [],
      createdAt: dbTrait.createdAt,
      updatedAt: dbTrait.updatedAt,
    };
  }
}
