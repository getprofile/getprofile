// ProfileSummarizer - Generates natural language summaries of user profiles
// Uses traits and memories to create concise profile summaries

import { getProfileById, updateProfile } from "@getprofile/db";
import type { Trait, Memory } from "../types";
import { loadPrompt, DEFAULT_SUMMARIZATION_PROMPT } from "../utils/prompts";
import { createProvider, type ProviderConfig } from "../providers";
import { createLogger } from "../utils/logger";

const logger = createLogger({ name: "profile-summarizer" });

export interface ProfileSummarizerConfig {
  llm?: {
    provider?: "openai" | "anthropic" | "custom";
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
  };
  // Minimum time between summary regenerations (in minutes)
  summarizationInterval?: number;
}

/**
 * ProfileSummarizer generates natural language summaries of user profiles.
 * Summaries are cached in the database and regenerated periodically.
 *
 * Prompts are loaded from config/prompts/summarization.md at runtime.
 */
export class ProfileSummarizer {
  private config: ProfileSummarizerConfig;
  private promptTemplate: string;

  constructor(config?: ProfileSummarizerConfig) {
    this.config = {
      summarizationInterval: 60, // Default: 60 minutes
      ...config,
    };

    // Load prompt template from file or use fallback
    this.promptTemplate = loadPrompt(
      "summarization.md",
      DEFAULT_SUMMARIZATION_PROMPT
    );
  }

  /**
   * Get the cached summary for a profile, or generate if missing/stale.
   */
  async getSummary(
    profileId: string,
    traits: Trait[],
    memories: Memory[]
  ): Promise<string> {
    // Check if we have a cached summary that's still fresh
    const profile = await getProfileById(profileId);
    if (!profile) {
      return "";
    }

    const shouldRegenerate = this.shouldRegenerateSummary(
      profile.summaryUpdatedAt
    );

    if (profile.summary && !shouldRegenerate) {
      // Return cached summary
      return profile.summary;
    }

    // Generate new summary
    return await this.regenerate(profileId, traits, memories, {
      previousVersion: profile.summaryVersion ?? 0,
    });
  }

  /**
   * Force regenerate the profile summary.
   */
  async regenerate(
    profileId: string,
    traits: Trait[],
    memories: Memory[],
    options?: { previousVersion?: number }
  ): Promise<string> {
    try {
      const summary = await this.generateSummary(profileId, traits, memories);
      const previousVersion = await this.resolvePreviousSummaryVersion(
        profileId,
        options?.previousVersion
      );

      // Save to database
      await updateProfile(profileId, {
        summary,
        summaryVersion: previousVersion + 1,
        summaryUpdatedAt: new Date(),
      });

      return summary;
    } catch (error) {
      logger.error({ err: error, profileId }, "Failed to generate summary");
      // Return a fallback basic summary
      return this.generateBasicSummary(traits);
    }
  }

  // === Private helpers ===

  /**
   * Check if summary should be regenerated based on time interval.
   */
  private shouldRegenerateSummary(lastUpdated: Date | null): boolean {
    if (!lastUpdated) return true;

    const intervalMs = (this.config.summarizationInterval || 60) * 60 * 1000;
    const elapsed = Date.now() - lastUpdated.getTime();
    return elapsed >= intervalMs;
  }

  /**
   * Generate summary using LLM.
   */
  private async generateSummary(
    profileId: string,
    traits: Trait[],
    memories: Memory[]
  ): Promise<string> {
    const apiKey =
      this.config.llm?.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn({ profileId }, "No LLM API key, using basic summary");
      return this.generateBasicSummary(traits);
    }

    const prompt = this.buildSummarizationPrompt(traits, memories);
    const response = await this.callLLM(prompt);
    return response.trim();
  }

  private buildSummarizationPrompt(
    traits: Trait[],
    memories: Memory[]
  ): string {
    // Format traits
    const traitsText =
      traits.length > 0
        ? traits
            .filter((t) => t.confidence >= 0.5) // Filter low-confidence traits
            .map((t) => {
              const valueStr =
                typeof t.value === "object"
                  ? Array.isArray(t.value)
                    ? (t.value as string[]).join(", ")
                    : JSON.stringify(t.value)
                  : String(t.value);
              return `- ${t.key}: ${valueStr} (confidence: ${t.confidence.toFixed(2)})`;
            })
            .join("\n")
        : "No traits yet";

    // Format memories (top 10 by importance)
    const topMemories = memories
      .sort(
        (a, b) => b.importance * b.decayFactor - a.importance * a.decayFactor
      )
      .slice(0, 10);
    const memoriesText =
      topMemories.length > 0
        ? topMemories.map((m) => `- [${m.type}] ${m.content}`).join("\n")
        : "No memories yet";

    // Replace placeholders in the loaded template
    return this.promptTemplate
      .replace("{{traits}}", traitsText)
      .replace("{{memories}}", memoriesText);
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
            "You are a profile summarization assistant. Create concise, natural language summaries.",
        },
        { role: "user", content: prompt },
      ],
    });

    return response.content || "";
  }

  /**
   * Generate a basic summary from traits without using LLM.
   * Fallback when LLM is unavailable.
   */
  private generateBasicSummary(traits: Trait[]): string {
    if (traits.length === 0) {
      return "New user profile";
    }

    const parts: string[] = [];

    // Find name trait
    const nameTrait = traits.find((t) => t.key === "name");
    if (nameTrait && nameTrait.value) {
      parts.push(`This is ${nameTrait.value}.`);
    } else {
      parts.push("User profile:");
    }

    // Find communication style
    const styleTrait = traits.find((t) => t.key === "communication_style");
    if (styleTrait && styleTrait.value) {
      parts.push(`Prefers ${styleTrait.value} communication.`);
    }

    // Find expertise level
    const expertiseTrait = traits.find((t) => t.key === "expertise_level");
    if (expertiseTrait && expertiseTrait.value) {
      parts.push(`Has ${expertiseTrait.value} expertise.`);
    }

    // Find interests
    const interestsTrait = traits.find((t) => t.key === "interests");
    if (interestsTrait && Array.isArray(interestsTrait.value)) {
      const interests = (interestsTrait.value as string[])
        .slice(0, 3)
        .join(", ");
      parts.push(`Interested in: ${interests}.`);
    }

    return parts.join(" ");
  }

  private async resolvePreviousSummaryVersion(
    profileId: string,
    providedVersion?: number
  ): Promise<number> {
    if (
      typeof providedVersion === "number" &&
      Number.isFinite(providedVersion)
    ) {
      return providedVersion;
    }

    const profile = await getProfileById(profileId);
    return profile?.summaryVersion ?? 0;
  }
}
