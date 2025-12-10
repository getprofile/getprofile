// MemoryEngine - Main orchestrator for memory operations
// Coordinates extraction, storage, retrieval, and summarization

import { bulkCreateMemories, findSimilarMemory } from "@getprofile/db";
import { MemoryExtractor, type MemoryExtractorConfig } from "./extractor";
import { MemoryRetriever, type RetrievalOptions } from "./retriever";
import { ProfileSummarizer, type ProfileSummarizerConfig } from "./summarizer";
import type { Memory, MemoryCandidate, Trait } from "../types";
import { createLogger } from "../utils/logger";

const logger = createLogger({ name: 'memory-engine' });

export interface MemoryEngineConfig {
  llm?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
  };
  extractionEnabled?: boolean;
  summarizationInterval?: number;
}

export interface ProcessMessagesOptions {
  skipExtraction?: boolean;
  requestId?: string;
}

/**
 * MemoryEngine orchestrates all memory-related operations.
 * This is the main entry point for memory management.
 */
export class MemoryEngine {
  private extractor: MemoryExtractor;
  private retriever: MemoryRetriever;
  private summarizer: ProfileSummarizer;
  private config: MemoryEngineConfig;

  constructor(config?: MemoryEngineConfig) {
    this.config = config ?? {};

    // Validate configuration
    const summarizationInterval = this.config.summarizationInterval ?? 60;
    if (!Number.isFinite(summarizationInterval) || summarizationInterval < 1) {
      throw new Error(
        `Invalid summarizationInterval: ${summarizationInterval}. Must be a positive number (minutes).`
      );
    }

    const extractorConfig: MemoryExtractorConfig = {
      llm: this.config.llm,
      extractionEnabled: this.config.extractionEnabled ?? true,
    };

    const summarizerConfig: ProfileSummarizerConfig = {
      llm: this.config.llm,
      summarizationInterval,
    };

    this.extractor = new MemoryExtractor(extractorConfig);
    this.retriever = new MemoryRetriever();
    this.summarizer = new ProfileSummarizer(summarizerConfig);
  }

  /**
   * Process messages: extract and store memories.
   * This runs in background (via setImmediate) to avoid blocking.
   *
   * NOTE: Phase 1-3 use setImmediate for background processing.
   * Phase 4 will replace this with a proper job queue (BullMQ).
   */
  async processMessages(
    profileId: string,
    messages: { role: string; content: string; id?: string }[],
    options?: ProcessMessagesOptions
  ): Promise<void> {
    if (options?.skipExtraction || this.config.extractionEnabled === false) {
      return;
    }

    // Extract message IDs for source tracking
    const messageIds = messages
      .map((m) => m.id)
      .filter((id): id is string => id !== undefined);

    try {
      // Extract memories using LLM
      const candidates = await this.extractor.extract(messages, messageIds);

      if (candidates.length === 0) {
        return; // No memories extracted
      }

      // Deduplicate and store
      await this.storeMemories(profileId, candidates);

      logger.info({ profileId, count: candidates.length }, "Extracted memories for profile");
    } catch (error) {
      logger.error({ err: error, profileId }, "Failed to process messages for profile");
    }
  }

  /**
   * Extract potential memories from a set of messages synchronously.
   * Used by the ingestion endpoint to return results immediately.
   */
  async extractMemoriesFromMessages(
    messages: { role: string; content: string }[],
    messageIds?: string[]
  ): Promise<MemoryCandidate[]> {
    return this.extractor.extract(messages, messageIds);
  }

  /**
   * Store memory candidates immediately (no dedup outside of engine).
   */
  async storeMemoryCandidates(
    profileId: string,
    candidates: MemoryCandidate[]
  ): Promise<void> {
    await this.storeMemories(profileId, candidates);
  }

  /**
   * Retrieve relevant memories for a query.
   */
  async retrieveMemories(
    profileId: string,
    query?: string,
    options?: RetrievalOptions
  ): Promise<Memory[]> {
    return this.retriever.retrieve(profileId, query, options);
  }

  /**
   * Get recent memories regardless of importance.
   */
  async getRecentMemories(
    profileId: string,
    limit: number = 10
  ): Promise<Memory[]> {
    return this.retriever.getRecent(profileId, limit);
  }

  /**
   * Get or generate profile summary from traits and memories.
   */
  async getProfileSummary(
    profileId: string,
    traits: Trait[],
    memories: Memory[]
  ): Promise<string> {
    return this.summarizer.getSummary(profileId, traits, memories);
  }

  /**
   * Force regenerate profile summary.
   */
  async regenerateSummary(
    profileId: string,
    traits: Trait[],
    memories: Memory[]
  ): Promise<string> {
    return this.summarizer.regenerate(profileId, traits, memories);
  }

  // === Private helpers ===

  /**
   * Store memories with deduplication.
   * Checks for similar existing memories before storing.
   */
  private async storeMemories(
    profileId: string,
    candidates: MemoryCandidate[]
  ): Promise<void> {
    const toStore: MemoryCandidate[] = [];

    for (const candidate of candidates) {
      // Check for duplicate/similar memory
      const existing = await findSimilarMemory(profileId, candidate.content);

      if (existing) {
        // Memory already exists, skip
        logger.debug({ profileId, content: candidate.content.substring(0, 50) }, "Skipping duplicate memory");
        continue;
      }

      toStore.push(candidate);
    }

    if (toStore.length === 0) {
      return;
    }

    // Bulk insert
    await bulkCreateMemories(
      profileId,
      toStore.map((m) => ({
        content: m.content,
        type: m.type,
        importance: m.importance,
        sourceMessageIds: m.sourceMessageIds,
      }))
    );

    logger.info({ profileId, count: toStore.length }, "Stored new memories");
  }
}
