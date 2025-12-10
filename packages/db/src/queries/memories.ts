// Memory query helpers
// Database operations for memories (extracted facts)

import { eq, desc, and, sql } from 'drizzle-orm';
import { getDatabase } from '../client';
import { memories } from '../schema';

// MemoryType definition (avoid circular dependency with core package)
export type MemoryType = 'fact' | 'preference' | 'event' | 'context';

export interface CreateMemoryInput {
  profileId: string;
  content: string;
  type: MemoryType;
  importance: number;
  sourceMessageIds?: string[];
}

/**
 * Create a new memory for a profile.
 */
export async function createMemory(input: CreateMemoryInput) {
  const db = getDatabase();
  const [memory] = await db
    .insert(memories)
    .values({
      profileId: input.profileId,
      content: input.content,
      type: input.type,
      importance: input.importance,
      decayFactor: 1.0,
      sourceMessageIds: input.sourceMessageIds || [],
    })
    .returning();
  return memory!;
}

/**
 * Bulk create memories for a profile.
 * Used during batch extraction.
 */
export async function bulkCreateMemories(
  profileId: string,
  memoryInputs: Omit<CreateMemoryInput, 'profileId'>[]
) {
  if (memoryInputs.length === 0) return [];

  const db = getDatabase();
  const values = memoryInputs.map((input) => ({
    profileId,
    content: input.content,
    type: input.type,
    importance: input.importance,
    decayFactor: 1.0,
    sourceMessageIds: input.sourceMessageIds || [],
  }));

  const created = await db.insert(memories).values(values).returning();
  return created;
}

/**
 * Get memories for a profile, ordered by importance and recency.
 * Applies decay factor to importance scoring.
 */
export async function getMemoriesForProfile(
  profileId: string,
  options?: {
    limit?: number;
    type?: MemoryType;
    minImportance?: number;
  }
) {
  const db = getDatabase();
  const limit = options?.limit || 50;
  const minImportance = options?.minImportance || 0;

  const filters = [
    eq(memories.profileId, profileId),
  ];

  if (options?.type) {
    filters.push(eq(memories.type, options.type));
  }

  if (minImportance > 0) {
    filters.push(
      sql`${memories.importance} * ${memories.decayFactor} >= ${minImportance}`
    );
  }

  let query = db.select().from(memories).$dynamic();

  if (filters.length === 1) {
    query = query.where(filters[0]);
  } else if (filters.length > 1) {
    query = query.where(and(...filters));
  }

  // Order by effective importance (importance * decayFactor) and recency
  const results = await query
    .orderBy(
      desc(sql`${memories.importance} * ${memories.decayFactor}`),
      desc(memories.createdAt)
    )
    .limit(limit);

  return results;
}

/**
 * Get recent memories for a profile, regardless of importance.
 * Useful for showing recent context.
 */
export async function getRecentMemories(
  profileId: string,
  limit: number = 10
) {
  const db = getDatabase();
  const results = await db
    .select()
    .from(memories)
    .where(eq(memories.profileId, profileId))
    .orderBy(desc(memories.createdAt))
    .limit(limit);

  return results;
}

/**
 * Get all memories for a profile (unsorted export helper).
 */
export async function getAllMemoriesForProfile(profileId: string) {
  const db = getDatabase();
  return db
    .select()
    .from(memories)
    .where(eq(memories.profileId, profileId))
    .orderBy(memories.createdAt);
}

/**
 * Check if a memory with similar content already exists.
 * Used for deduplication during extraction.
 */
export async function findSimilarMemory(
  profileId: string,
  content: string
) {
  const db = getDatabase();

  // Simple exact match for Phase 2
  // Phase 5 will use pgvector for semantic similarity with threshold parameter
  const results = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.profileId, profileId),
        eq(memories.content, content)
      )
    )
    .limit(1);

  return results[0] || null;
}

/**
 * Update the last accessed timestamp for a memory.
 * Used to track memory usage for future decay algorithms.
 */
export async function touchMemory(memoryId: string) {
  const db = getDatabase();
  await db
    .update(memories)
    .set({ lastAccessedAt: new Date() })
    .where(eq(memories.id, memoryId));
}

/**
 * Delete a memory by ID.
 */
export async function deleteMemory(memoryId: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db
    .delete(memories)
    .where(eq(memories.id, memoryId))
    .returning({ id: memories.id });

  return result.length > 0;
}

/**
 * Delete all memories for a profile.
 * Used during profile deletion (GDPR right to erasure).
 */
export async function deleteMemoriesForProfile(profileId: string) {
  const db = getDatabase();
  const result = await db
    .delete(memories)
    .where(eq(memories.profileId, profileId));
  return result;
}

/**
 * Count memories for a profile.
 */
export async function countMemoriesForProfile(profileId: string) {
  const db = getDatabase();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memories)
    .where(eq(memories.profileId, profileId));

  return result?.count || 0;
}
