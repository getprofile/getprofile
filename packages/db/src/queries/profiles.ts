// Profile query helpers

import { eq, desc, sql, ilike } from 'drizzle-orm';
import { getDatabase } from '../client';
import { profiles } from '../schema';

export interface CreateProfileInput {
  externalId: string;
}

export interface UpdateProfileInput {
  summary?: string | null;
  summaryVersion?: number;
  summaryUpdatedAt?: Date | null;
}

/**
 * Get a profile by external ID.
 * This is the primary lookup method for the proxy.
 */
export async function getProfileByExternalId(
  externalId: string
): Promise<typeof profiles.$inferSelect | null> {
  const db = getDatabase();
  
  const result = await db
    .select()
    .from(profiles)
    .where(eq(profiles.externalId, externalId))
    .limit(1);
  
  return result[0] ?? null;
}

/**
 * Get a profile by internal ID.
 * Used for profile detail views and updates.
 */
export async function getProfileById(
  profileId: string
): Promise<typeof profiles.$inferSelect | null> {
  const db = getDatabase();
  
  const result = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  
  return result[0] ?? null;
}

/**
 * Create a new profile.
 */
export async function createProfile(
  input: CreateProfileInput
): Promise<typeof profiles.$inferSelect> {
  const db = getDatabase();
  
  const result = await db
    .insert(profiles)
    .values({
      externalId: input.externalId,
    })
    .returning();
  
  return result[0]!;
}

/**
 * Get or create a profile by external ID.
 * This is the main entry point for the proxy.
 * 
 * Handles race conditions gracefully: if two concurrent requests try to create
 * the same profile, one will succeed and the other will catch the unique
 * constraint violation and return the existing profile.
 */
export async function getOrCreateProfile(
  externalId: string
): Promise<typeof profiles.$inferSelect> {
  // Check if profile already exists (common case)
  const existing = await getProfileByExternalId(externalId);
  if (existing) {
    return existing;
  }
  
  // Profile doesn't exist, try to create it
  try {
    return await createProfile({ externalId });
  } catch (error: unknown) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    // This occurs when another concurrent request created the profile
    // between our check and insert (TOCTOU race condition)
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      // Profile was created by another concurrent request, fetch and return it
      const created = await getProfileByExternalId(externalId);
      if (!created) {
        // This should never happen, but handle it gracefully
        throw new Error(
          `Profile with externalId "${externalId}" should exist but was not found after unique constraint violation`
        );
      }
      return created;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Update a profile.
 */
export async function updateProfile(
  profileId: string,
  input: UpdateProfileInput
): Promise<typeof profiles.$inferSelect | null> {
  const db = getDatabase();
  
  const result = await db
    .update(profiles)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId))
    .returning();
  
  return result[0] ?? null;
}

/**
 * Delete a profile (cascade deletes traits, memories, messages).
 */
export async function deleteProfile(
  profileId: string
): Promise<boolean> {
  const db = getDatabase();
  
  const result = await db
    .delete(profiles)
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id });
  
  return result.length > 0;
}

/**
 * List profiles with pagination.
 */
export async function listProfiles(
  options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }
): Promise<{ profiles: (typeof profiles.$inferSelect)[]; total: number }> {
  const db = getDatabase();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const search = options?.search?.trim();

  const whereClause = search
    ? ilike(profiles.externalId, `%${search}%`)
    : undefined;
  
  // Get profiles with pagination
  let profileQuery = db
    .select()
    .from(profiles)
    .orderBy(desc(profiles.updatedAt))
    .limit(limit)
    .offset(offset)
    .$dynamic();

  if (whereClause) {
    profileQuery = profileQuery.where(whereClause);
  }

  const profileList = await profileQuery;
  
  // Get total count
  let countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .$dynamic();

  if (whereClause) {
    countQuery = countQuery.where(whereClause);
  }

  const countResult = await countQuery;
  
  return {
    profiles: profileList,
    total: countResult[0]?.count ?? 0,
  };
}
