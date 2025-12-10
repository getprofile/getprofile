// Trait query helpers

import { eq, and, sql } from 'drizzle-orm';
import { getDatabase } from '../client';
import { traits } from '../schema';

export interface CreateTraitInput {
  profileId: string;
  key: string;
  category?: string | null;
  valueType: string;
  valueJson: unknown;
  confidence?: number;
  source?: string;
  sourceMessageIds?: string[];
}

export interface UpdateTraitInput {
  valueJson?: unknown;
  confidence?: number;
  source?: string;
  sourceMessageIds?: string[];
}

/**
 * Get all traits for a profile.
 */
export async function getTraitsForProfile(
  profileId: string
): Promise<(typeof traits.$inferSelect)[]> {
  const db = getDatabase();
  
  return db
    .select()
    .from(traits)
    .where(eq(traits.profileId, profileId));
}

/**
 * Get a specific trait by key for a profile.
 */
export async function getTraitByKey(
  profileId: string,
  key: string
): Promise<typeof traits.$inferSelect | null> {
  const db = getDatabase();
  
  const result = await db
    .select()
    .from(traits)
    .where(and(eq(traits.profileId, profileId), eq(traits.key, key)))
    .limit(1);
  
  return result[0] ?? null;
}

/**
 * Create a new trait.
 */
export async function createTrait(
  input: CreateTraitInput
): Promise<typeof traits.$inferSelect> {
  const db = getDatabase();
  
  const result = await db
    .insert(traits)
    .values({
      profileId: input.profileId,
      key: input.key,
      category: input.category ?? null,
      valueType: input.valueType,
      valueJson: input.valueJson,
      confidence: input.confidence ?? 0.5,
      source: input.source ?? 'extracted',
      sourceMessageIds: input.sourceMessageIds ?? [],
    })
    .returning();
  
  return result[0]!;
}

/**
 * Update an existing trait by key.
 */
export async function updateTraitByKey(
  profileId: string,
  key: string,
  input: UpdateTraitInput
): Promise<typeof traits.$inferSelect | null> {
  const db = getDatabase();
  
  const result = await db
    .update(traits)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(traits.profileId, profileId), eq(traits.key, key)))
    .returning();
  
  return result[0] ?? null;
}

/**
 * Upsert a trait (create or update).
 */
export async function upsertTrait(
  input: CreateTraitInput
): Promise<typeof traits.$inferSelect> {
  const db = getDatabase();
  const timestamp = new Date();
  const insertValues = {
    profileId: input.profileId,
    key: input.key,
    category: input.category ?? null,
    valueType: input.valueType,
    valueJson: input.valueJson,
    confidence: input.confidence ?? 0.5,
    source: input.source ?? 'extracted',
    sourceMessageIds: input.sourceMessageIds ?? [],
    updatedAt: timestamp,
  };

  const updateSet: Partial<typeof traits.$inferInsert> = {
    valueJson: insertValues.valueJson,
    updatedAt: timestamp,
  };

  if (input.confidence !== undefined) {
    updateSet.confidence = input.confidence;
  }

  if (input.source !== undefined) {
    updateSet.source = input.source;
  }

  if (input.sourceMessageIds !== undefined) {
    updateSet.sourceMessageIds = input.sourceMessageIds;
  }

  const result = await db
    .insert(traits)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [traits.profileId, traits.key],
      set: updateSet,
    })
    .returning();

  return result[0]!;
}

/**
 * Delete a trait by key.
 */
export async function deleteTraitByKey(
  profileId: string,
  key: string
): Promise<boolean> {
  const db = getDatabase();
  
  const result = await db
    .delete(traits)
    .where(and(eq(traits.profileId, profileId), eq(traits.key, key)))
    .returning({ id: traits.id });
  
  return result.length > 0;
}

/**
 * Bulk upsert traits for a profile.
 * Used when applying multiple trait updates from extraction.
 */
export async function bulkUpsertTraits(
  profileId: string,
  traitInputs: Omit<CreateTraitInput, 'profileId'>[]
): Promise<(typeof traits.$inferSelect)[]> {
  if (traitInputs.length === 0) {
    return [];
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    type TraitInsert = typeof traits.$inferInsert;
    interface TraitGroup {
      records: TraitInsert[];
      hasConfidence: boolean;
      hasSource: boolean;
      hasSourceMessageIds: boolean;
    }

    const groups = new Map<string, TraitGroup>();

    for (const input of traitInputs) {
      const record: TraitInsert = {
        profileId,
        key: input.key,
        category: input.category ?? null,
        valueType: input.valueType,
        valueJson: input.valueJson,
        confidence: input.confidence ?? 0.5,
        source: input.source ?? 'extracted',
        sourceMessageIds: input.sourceMessageIds ?? [],
        updatedAt: new Date(),
      };

      const hasConfidence = input.confidence !== undefined;
      const hasSource = input.source !== undefined;
      const hasSourceMessageIds = input.sourceMessageIds !== undefined;
      const groupKey = `${hasConfidence ? 1 : 0}${hasSource ? 1 : 0}${hasSourceMessageIds ? 1 : 0}`;

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          records: [],
          hasConfidence,
          hasSource,
          hasSourceMessageIds,
        };
        groups.set(groupKey, group);
      }

      group.records.push(record);
    }

    const results: (typeof traits.$inferSelect)[] = [];

    for (const group of groups.values()) {
      if (group.records.length === 0) continue;

      const updateSet: Record<string, unknown> = {
        valueJson: sql`excluded.value_json`,
        updatedAt: sql`excluded.updated_at`,
      };

      if (group.hasConfidence) {
        updateSet.confidence = sql`excluded.confidence`;
      }
      if (group.hasSource) {
        updateSet.source = sql`excluded.source`;
      }
      if (group.hasSourceMessageIds) {
        updateSet.sourceMessageIds = sql`excluded.source_message_ids`;
      }

      const rows = await tx
        .insert(traits)
        .values(group.records)
        .onConflictDoUpdate({
          target: [traits.profileId, traits.key],
          set: updateSet,
        })
        .returning();

      results.push(...rows);
    }

    return results;
  });
}

/**
 * Count traits for a profile.
 */
export async function countTraitsForProfile(profileId: string): Promise<number> {
  const db = getDatabase();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(traits)
    .where(eq(traits.profileId, profileId));

  return result?.count ?? 0;
}
