// Message query helpers

import { eq, and, desc, sql, lt, inArray } from 'drizzle-orm';
import { getDatabase } from '../client';
import { messages } from '../schema';

export interface CreateMessageInput {
  profileId: string;
  role: string;
  content: string;
  requestId?: string;
  model?: string;
}

/**
 * Get messages for a profile with pagination.
 */
export async function getMessagesForProfile(
  profileId: string,
  options?: {
    limit?: number;
    offset?: number;
    unprocessedOnly?: boolean;
  }
): Promise<(typeof messages.$inferSelect)[]> {
  const db = getDatabase();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  
  const query = db
    .select()
    .from(messages)
    .where(
      options?.unprocessedOnly
        ? and(eq(messages.profileId, profileId), eq(messages.processed, false))
        : eq(messages.profileId, profileId)
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .offset(offset);
  
  return query;
}

/**
 * Get recent messages for context building.
 */
export async function getRecentMessages(
  profileId: string,
  limit: number = 20
): Promise<(typeof messages.$inferSelect)[]> {
  const db = getDatabase();
  
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  
  // Return in chronological order (oldest first)
  return result.reverse();
}

/**
 * Get all messages for a profile (for export).
 */
export async function getAllMessagesForProfile(
  profileId: string
): Promise<(typeof messages.$inferSelect)[]> {
  const db = getDatabase();

  return db
    .select()
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .orderBy(messages.createdAt);
}

/**
 * Create a new message.
 */
export async function createMessage(
  input: CreateMessageInput
): Promise<typeof messages.$inferSelect> {
  const db = getDatabase();
  
  const result = await db
    .insert(messages)
    .values({
      profileId: input.profileId,
      role: input.role,
      content: input.content,
      requestId: input.requestId ?? null,
      model: input.model ?? null,
      processed: false,
    })
    .returning();
  
  return result[0]!;
}

/**
 * Bulk create messages (for storing a conversation).
 */
export async function bulkCreateMessages(
  profileId: string,
  messageInputs: Omit<CreateMessageInput, 'profileId'>[],
  requestId?: string
): Promise<(typeof messages.$inferSelect)[]> {
  const db = getDatabase();
  
  if (messageInputs.length === 0) {
    return [];
  }
  
  const result = await db
    .insert(messages)
    .values(
      messageInputs.map((input) => ({
        profileId,
        role: input.role,
        content: input.content,
        requestId: requestId ?? input.requestId ?? null,
        model: input.model ?? null,
        processed: false,
      }))
    )
    .returning();
  
  return result;
}

/**
 * Mark messages as processed.
 */
export async function markMessagesProcessed(
  profileId: string,
  messageIds: string[]
): Promise<number> {
  const db = getDatabase();
  
  if (messageIds.length === 0) {
    return 0;
  }
  
  const result = await db
    .update(messages)
    .set({ processed: true })
    .where(
      and(
        eq(messages.profileId, profileId),
        inArray(messages.id, messageIds)
      )
    )
    .returning({ id: messages.id });
  
  return result.length;
}

/**
 * Get message count for a profile.
 */
export async function getMessageCount(
  profileId: string
): Promise<number> {
  const db = getDatabase();
  
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.profileId, profileId));
  
  return result[0]?.count ?? 0;
}

/**
 * Delete old messages beyond retention limit.
 * Returns the number of deleted messages.
 */
export async function deleteOldMessages(
  profileId: string,
  keepCount: number
): Promise<number> {
  const db = getDatabase();
  
  // Get the timestamp of the Nth most recent message
  const cutoffMessages = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .orderBy(desc(messages.createdAt))
    .limit(1)
    .offset(keepCount - 1);
  
  if (cutoffMessages.length === 0) {
    return 0; // Less messages than keepCount
  }
  
  const cutoffDate = cutoffMessages[0]!.createdAt;
  
  // Delete messages older than the cutoff
  const result = await db
    .delete(messages)
    .where(
      and(
        eq(messages.profileId, profileId),
        lt(messages.createdAt, cutoffDate)
      )
    )
    .returning({ id: messages.id });
  
  return result.length;
}
