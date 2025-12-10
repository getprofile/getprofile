// ProfileManager - Main entry point for profile operations
// Orchestrates profile, trait, and memory operations

import {
  getOrCreateProfile as dbGetOrCreateProfile,
  getProfileById as dbGetProfileById,
  updateProfile as dbUpdateProfile,
  bulkCreateMessages,
  getRecentMessages,
  getMessageCount,
  deleteOldMessages,
} from '@getprofile/db';
import type { Profile, ProfileContext, TraitUpdate, TraitSchema } from '../types';
import { TraitEngine, type TraitEngineConfig } from '../traits/engine';
import { MemoryEngine, type MemoryEngineConfig } from '../memory/engine';
import { MEMORY_DEFAULTS, PROFILE_DEFAULTS } from '../constants';
import { logError } from '../utils/error-handling';
import { createLogger } from '../utils/logger';

const logger = createLogger({ name: 'profile-manager' });

export interface ProfileManagerConfig {
  // LLM configuration for trait and memory extraction
  llm?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  // Whether trait extraction is enabled
  traitExtractionEnabled?: boolean;
  // Whether memory extraction is enabled
  memoryExtractionEnabled?: boolean;
  // Minimum time between summary regenerations (in minutes)
  summarizationInterval?: number;
  // Soft cap on messages per profile before retention kicks in
  maxMessagesPerProfile?: number;
}

/**
 * ProfileManager handles all profile-related operations.
 * This is the main entry point for the proxy and other consumers.
 */
export class ProfileManager {
  private traitEngine: TraitEngine;
  private memoryEngine: MemoryEngine;
  private config: ProfileManagerConfig;

  constructor(config?: ProfileManagerConfig) {
    this.config = config ?? {};

    // Validate configuration
    const summarizationInterval = this.config.summarizationInterval ?? PROFILE_DEFAULTS.DEFAULT_SUMMARIZATION_INTERVAL;
    if (!Number.isFinite(summarizationInterval) || summarizationInterval < 1) {
      throw new Error(
        `Invalid summarizationInterval: ${summarizationInterval}. Must be a positive number (minutes).`
      );
    }

    // Initialize TraitEngine with shared LLM config
    const traitConfig: TraitEngineConfig = {
      llm: this.config.llm,
      extractionEnabled: this.config.traitExtractionEnabled ?? true,
    };
    this.traitEngine = new TraitEngine(traitConfig);

    // Initialize MemoryEngine with shared LLM config
    const memoryConfig: MemoryEngineConfig = {
      llm: this.config.llm,
      extractionEnabled: this.config.memoryExtractionEnabled ?? true,
      summarizationInterval,
    };
    this.memoryEngine = new MemoryEngine(memoryConfig);
  }

  /**
   * Get the TraitEngine instance.
   * Useful for direct trait operations.
   */
  getTraitEngine(): TraitEngine {
    return this.traitEngine;
  }

  /**
   * Get the MemoryEngine instance.
   * Useful for direct memory operations.
   */
  getMemoryEngine(): MemoryEngine {
    return this.memoryEngine;
  }

  /**
   * Get or create a profile by external ID.
   * This is the main entry point for the proxy.
   */
  async getOrCreateProfile(externalId: string): Promise<Profile> {
    const dbProfile = await dbGetOrCreateProfile(externalId);
    return this.mapDbProfile(dbProfile);
  }

  /**
   * Get a profile by internal ID.
   */
  async getProfile(profileId: string): Promise<Profile | null> {
    const dbProfile = await dbGetProfileById(profileId);
    return dbProfile ? this.mapDbProfile(dbProfile) : null;
  }

  /**
   * Build full context for a profile (profile + traits + memories).
   * Used for prompt injection.
   *
   * @param profileId - The internal profile ID
   * @param query - Optional query for semantic memory retrieval (Phase 5)
   * @returns Complete profile context including traits and memories
   *
   * @example
   * ```typescript
   * const manager = new ProfileManager();
   * const context = await manager.buildContext('profile-123');
   * // Returns: {
   * //   profile: { id: 'profile-123', externalId: 'user-456', ... },
   * //   traits: [{ key: 'name', value: 'Alex', ... }],
   * //   recentMemories: [{ content: 'User works at startup', ... }],
   * //   summary: 'Alex is a senior developer who prefers technical communication.'
   * // }
   * ```
   */
  async buildContext(profileId: string, query?: string): Promise<ProfileContext> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Get traits using TraitEngine (schemas are loaded at construction time)
    const traits = await this.traitEngine.getTraits(profileId);

    // Get recent memories using MemoryEngine
    // Phase 2: Uses importance + recency scoring
    // Phase 5: Will use semantic search with query parameter
    const recentMemories = await this.memoryEngine.retrieveMemories(
      profileId,
      query,
      { limit: MEMORY_DEFAULTS.DEFAULT_LIMIT, minImportance: MEMORY_DEFAULTS.DEFAULT_MIN_IMPORTANCE }
    );

    // Get or generate profile summary
    const summary = await this.memoryEngine.getProfileSummary(
      profileId,
      traits,
      recentMemories
    );

    return {
      profile,
      traits,
      recentMemories,
      summary,
    };
  }

  /**
   * Build injection text for the system prompt.
   * This is what gets injected into the conversation.
   *
   * @param profileId - The internal profile ID
   * @param query - Optional query for semantic memory retrieval (Phase 5)
   * @param customTraitSchemas - Optional per-request trait schema overrides
   * @returns Formatted text ready to inject into system message
   *
   * @example
   * ```typescript
   * const manager = new ProfileManager();
   * const injectionText = await manager.buildInjectionText('profile-123');
   * // Returns:
   * // "## User Profile
   * //  Alex is a senior developer who prefers technical communication.
   * //
   * //  ## User Attributes
   * //  User's name is Alex.
   * //  User prefers technical communication style.
   * //
   * //  ## Relevant Context
   * //  - User works at a startup
   * //  - User has 5+ years of Python experience"
   * ```
   */
  async buildInjectionText(
    profileId: string,
    query?: string,
    customTraitSchemas?: TraitSchema[]
  ): Promise<string> {
    const context = await this.buildContext(profileId, query);
    const parts: string[] = [];

    // Add profile summary
    if (context.summary) {
      parts.push(`## User Profile\n${context.summary}`);
    }

    // Add traits using TraitEngine's template-based formatting (with custom schemas if provided)
    const traitContext = this.traitEngine.buildInjectionContext(context.traits, customTraitSchemas);
    if (traitContext) {
      parts.push(`## User Attributes\n${traitContext}`);
    }

    // Add memories (when implemented)
    if (context.recentMemories.length > 0) {
      const memoryLines = context.recentMemories.map((m) => `- ${m.content}`);
      parts.push(`## Relevant Context\n${memoryLines.join('\n')}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Store messages from a conversation.
   * This just stores the messages without extraction.
   */
  async storeConversation(
    profileId: string,
    messages: { role: string; content: string }[],
    requestId?: string
  ): Promise<void> {
    await bulkCreateMessages(profileId, messages, requestId);
  }

  /**
   * Process a completed conversation: store messages, extract traits and memories.
   * This is the main entry point for background processing.
   *
   * @param profileId - The internal profile ID
   * @param messages - Conversation messages to process
   * @param options - Processing options (requestId, skipExtraction, customTraitSchemas)
   * @returns Processing results with extracted traits
   *
   * @example
   * ```typescript
   * const manager = new ProfileManager();
   * const result = await manager.processConversation(
   *   'profile-123',
   *   [
   *     { role: 'user', content: "I'm switching to TypeScript" },
   *     { role: 'assistant', content: 'Great choice! Let me help...' }
   *   ]
   * );
   * // Returns: {
   * //   stored: true,
   * //   traitsExtracted: [
   * //     { key: 'interests', value: ['TypeScript', ...], action: 'update' }
   * //   ]
   * // }
   * // Memory extraction runs in background via setImmediate
   * ```
   */
  async processConversation(
    profileId: string,
    messages: { role: string; content: string }[],
    options?: {
      requestId?: string;
      skipExtraction?: boolean;
      customTraitSchemas?: TraitSchema[];
    }
  ): Promise<{ stored: boolean; traitsExtracted: TraitUpdate[] }> {
    // Store messages and get the created message IDs
    const storedMessages = await bulkCreateMessages(profileId, messages, options?.requestId);
    const messageIds = storedMessages.map((m) => m.id);

    // Extract traits if enabled
    let traitsExtracted: TraitUpdate[] = [];
    if (!options?.skipExtraction && this.config.traitExtractionEnabled !== false) {
      try {
        traitsExtracted = await this.traitEngine.extractAndApply(
          profileId,
          messages,
          options?.customTraitSchemas
        );

        if (traitsExtracted.length > 0) {
          logger.info(
            {
              profileId,
              traitCount: traitsExtracted.length,
              traits: traitsExtracted.map((t) => ({ key: t.key, value: t.value })),
            },
            'Extracted traits for profile'
          );
        }
      } catch (error) {
        logError('ProfileManager', error, {
          profileId,
          messageCount: messages.length,
          operation: 'trait_extraction',
        });
      }
    }

    // Extract memories if enabled (runs in background via MemoryEngine)
    if (!options?.skipExtraction && this.config.memoryExtractionEnabled !== false) {
      // NOTE: Phase 1-3 implementation using setImmediate for background processing.
      // This is a temporary solution with known limitations:
      // - Heavy LLM calls can block the event loop
      // - No retry logic for transient failures
      // - Difficult to scale horizontally
      // Phase 4 will replace with BullMQ/job queue for production reliability.
      // See plan.md section 10.4 for migration details.
      setImmediate(async () => {
        try {
          const messagesWithIds = messages.map((m, i) => ({
            ...m,
            id: messageIds[i],
          }));
          await this.memoryEngine.processMessages(profileId, messagesWithIds);
        } catch (error) {
          logError('ProfileManager', error, {
            profileId,
            messageCount: messages.length,
            operation: 'memory_extraction',
          });
        }
      });
    }

    // Enforce message retention if configured
    await this.enforceMessageRetention(profileId);

    return { stored: true, traitsExtracted };
  }

  /**
   * Update profile summary (manual override).
   */
  async updateSummary(
    profileId: string,
    summary: string
  ): Promise<Profile | null> {
    const existing = await dbGetProfileById(profileId);
    if (!existing) {
      return null;
    }

    const previousVersion = existing.summaryVersion ?? 0;
    const updated = await dbUpdateProfile(profileId, {
      summary,
      summaryVersion: previousVersion + 1,
      summaryUpdatedAt: new Date(),
    });
    return updated ? this.mapDbProfile(updated) : null;
  }

  /**
   * Force regenerate profile summary using MemoryEngine.
   */
  async regenerateSummary(profileId: string): Promise<string> {
    const traits = await this.traitEngine.getTraits(profileId);
    const memories = await this.memoryEngine.getRecentMemories(profileId, MEMORY_DEFAULTS.DEFAULT_LIMIT * 2);
    return await this.memoryEngine.regenerateSummary(profileId, traits, memories);
  }

  /**
   * Get recent messages for a profile.
   */
  async getRecentMessages(
    profileId: string,
    limit: number = 20
  ): Promise<{ role: string; content: string; createdAt: Date }[]> {
    const messages = await getRecentMessages(profileId, limit);
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  // === Private helpers ===

  private mapDbProfile(dbProfile: {
    id: string;
    externalId: string;
    summary: string | null;
    summaryVersion: number | null;
    summaryUpdatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Profile {
    return {
      id: dbProfile.id,
      externalId: dbProfile.externalId,
      summary: dbProfile.summary,
      summaryVersion: dbProfile.summaryVersion ?? 0,
      summaryUpdatedAt: dbProfile.summaryUpdatedAt,
      createdAt: dbProfile.createdAt,
      updatedAt: dbProfile.updatedAt,
    };
  }

  /**
   * Delete old messages when the soft cap is exceeded and refresh summary.
   */
  private async enforceMessageRetention(profileId: string): Promise<number> {
    const limit = this.config.maxMessagesPerProfile ?? 0;
    if (!Number.isFinite(limit) || limit <= 0) {
      return 0;
    }

    const count = await getMessageCount(profileId);
    if (count <= limit) {
      return 0;
    }

    const deleted = await deleteOldMessages(profileId, limit);
    if (deleted > 0) {
      // Regenerate summary in background since context changed
      setImmediate(async () => {
        try {
          const traits = await this.traitEngine.getTraits(profileId);
          const memories = await this.memoryEngine.getRecentMemories(profileId, MEMORY_DEFAULTS.DEFAULT_LIMIT * 2);
          await this.memoryEngine.regenerateSummary(profileId, traits, memories);
        } catch (error) {
          logError('ProfileManager', error, {
            profileId,
            operation: 'summary_regeneration',
          });
        }
      });
    }

    return deleted;
  }

  // Basic summary generation is now handled by MemoryEngine's ProfileSummarizer
}
