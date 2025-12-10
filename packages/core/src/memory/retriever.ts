// MemoryRetriever - Retrieves relevant memories for a profile
// Phase 2: Simple recency + importance scoring
// Phase 5: Will add semantic search with pgvector

import { getMemoriesForProfile, touchMemory } from '@getprofile/db';
import type { Memory, MemoryType } from '../types';
import { MEMORY_DEFAULTS } from '../constants';
import { createLogger } from '../utils/logger';

const logger = createLogger({ name: 'memory-retriever' });

export interface RetrievalOptions {
  limit?: number;
  type?: MemoryType;
  minImportance?: number;
}

/**
 * MemoryRetriever handles memory retrieval with ranking.
 *
 * Phase 2: Uses importance * decayFactor + recency
 * Phase 5: Will add semantic similarity using pgvector
 */
export class MemoryRetriever {
  /**
   * Retrieve relevant memories for a profile.
   *
   * @param profileId - The profile to retrieve memories for
   * @param query - Optional query for semantic search (Phase 5)
   * @param options - Retrieval options (limit, type filter, min importance)
   */
  async retrieve(
    profileId: string,
    query?: string,
    options?: RetrievalOptions
  ): Promise<Memory[]> {
    // For Phase 2, we ignore the query parameter
    // Phase 5 will use it for semantic search with embeddings
    void query;

    const limit = options?.limit || MEMORY_DEFAULTS.DEFAULT_LIMIT;
    const minImportance = options?.minImportance || 0.1;

    // Get memories from database, already sorted by importance * decayFactor and recency
    const dbMemories = await getMemoriesForProfile(profileId, {
      limit,
      type: options?.type,
      minImportance,
    });

    // Map to Memory type
    const memories = dbMemories.map((m) => this.mapDbMemory(m));

    // Touch memories to update lastAccessedAt (for future decay algorithms)
    // Do this in background to avoid slowing down retrieval
    this.touchMemoriesInBackground(memories.map((m) => m.id));

    return memories;
  }

  /**
   * Get recent memories regardless of importance.
   * Useful for showing recent context.
   */
  async getRecent(profileId: string, limit: number = MEMORY_DEFAULTS.DEFAULT_LIMIT): Promise<Memory[]> {
    const { getRecentMemories } = await import('@getprofile/db');
    const dbMemories = await getRecentMemories(profileId, limit);
    return dbMemories.map((m) => this.mapDbMemory(m));
  }

  // === Private helpers ===

  private mapDbMemory(dbMemory: {
    id: string;
    profileId: string;
    content: string;
    type: string;
    importance: number | null;
    decayFactor: number | null;
    sourceMessageIds: unknown;
    createdAt: Date;
    lastAccessedAt: Date | null;
  }): Memory {
    return {
      id: dbMemory.id,
      profileId: dbMemory.profileId,
      content: dbMemory.content,
      type: dbMemory.type as MemoryType,
      importance: dbMemory.importance ?? MEMORY_DEFAULTS.DEFAULT_IMPORTANCE,
      decayFactor: dbMemory.decayFactor ?? 1.0,
      sourceMessageIds: (dbMemory.sourceMessageIds as string[]) || [],
      createdAt: dbMemory.createdAt,
      lastAccessedAt: dbMemory.lastAccessedAt,
    };
  }

  private touchMemoriesInBackground(memoryIds: string[]) {
    // Update lastAccessedAt for accessed memories in background
    // This is used for future decay algorithms
    setImmediate(async () => {
      try {
        await Promise.all(memoryIds.map((id) => touchMemory(id)));
      } catch (error) {
        // Log but don't fail - touching is best-effort
        logger.error({ err: error, memoryIds }, 'Failed to touch memories');
      }
    });
  }
}
