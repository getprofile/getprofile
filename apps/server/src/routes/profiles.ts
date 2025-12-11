// REST API for profiles, traits, and memories

import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  countMemoriesForProfile,
  countTraitsForProfile,
  createMemory,
  deleteMemory,
  deleteProfile,
  deleteTraitByKey,
  getAllMemoriesForProfile,
  getAllMessagesForProfile,
  getMemoriesForProfile,
  getMessageCount,
  getProfileByExternalId,
  getTraitsForProfile,
  listProfiles,
  upsertTrait,
} from '@getprofile/db';
import type { traits, memories, messages } from '@getprofile/db';
import type {
  Memory,
  MemoryType,
  Profile,
  Trait,
  TraitValueType,
  TraitUpdate,
} from '@getprofile/core';
import { getProfileManager } from '../lib/profile-manager';
import { sendError } from '../lib/errors';
import { createLogger } from '@getprofile/core';

const logger = createLogger({ name: 'profiles-route' });

const profiles = new Hono();
const MAX_LIST_LIMIT = 100;
type TraitRecord = typeof traits.$inferSelect;
type MemoryRecord = typeof memories.$inferSelect;
type MessageRecord = typeof messages.$inferSelect;

function serializeProfile(profile: Profile) {
  return {
    ...profile,
    summaryUpdatedAt: profile.summaryUpdatedAt
      ? profile.summaryUpdatedAt.toISOString()
      : null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

// Type guards for serialization
function isTraitRecord(trait: Trait | TraitRecord): trait is TraitRecord {
  return 'valueJson' in trait;
}

function isTrait(trait: Trait | TraitRecord): trait is Trait {
  return 'value' in trait && !('valueJson' in trait);
}

function serializeTrait(trait: Trait | TraitRecord) {
  const value = isTrait(trait)
    ? trait.value
    : isTraitRecord(trait)
      ? trait.valueJson
      : null;

  const sourceMessageIds = isTrait(trait)
    ? trait.sourceMessageIds
    : isTraitRecord(trait)
      ? (trait.sourceMessageIds as unknown)
      : [];

  const valueType: TraitValueType = isTrait(trait)
    ? trait.valueType
    : (trait.valueType as TraitValueType);

  const confidence = isTrait(trait)
    ? trait.confidence
    : (trait.confidence ?? 0.5);

  const source = isTrait(trait)
    ? trait.source
    : (trait.source ?? 'extracted');

  return {
    id: trait.id,
    profileId: trait.profileId,
    key: trait.key,
    category: trait.category,
    valueType,
    value,
    confidence,
    source,
    sourceMessageIds: Array.isArray(sourceMessageIds) ? sourceMessageIds : [],
    createdAt: trait.createdAt.toISOString(),
    updatedAt: trait.updatedAt.toISOString(),
  };
}

// Type guard for memory
function isMemoryRecord(memory: Memory | MemoryRecord): memory is MemoryRecord {
  return 'importance' in memory && typeof (memory as { importance?: unknown }).importance === 'number';
}

function serializeMemory(memory: Memory | MemoryRecord) {
  let sourceMessageIds: string[];
  let importance: number;
  let decayFactor: number;

  if (isMemoryRecord(memory)) {
    sourceMessageIds = Array.isArray(memory.sourceMessageIds) ? memory.sourceMessageIds : [];
    importance = memory.importance ?? 0.5;
    decayFactor = memory.decayFactor ?? 1.0;
  } else {
    sourceMessageIds = (memory as Memory).sourceMessageIds;
    importance = (memory as Memory).importance;
    decayFactor = (memory as Memory).decayFactor;
  }

  return {
    id: memory.id,
    profileId: memory.profileId,
    content: memory.content,
    type: memory.type,
    importance,
    decayFactor,
    sourceMessageIds,
    createdAt: memory.createdAt.toISOString(),
    lastAccessedAt: memory.lastAccessedAt
      ? memory.lastAccessedAt.toISOString()
      : null,
  };
}

function serializeMessage(message: MessageRecord) {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
  };
}

function inferValueType(value: unknown): TraitValueType | null {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  return null;
}

function parseLimit(
  value: string | undefined | null,
  defaultValue: number,
  maxValue: number
) {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.min(parsed, maxValue);
}

function isValidMemoryType(type: string): type is MemoryType {
  return ['fact', 'preference', 'event', 'context'].includes(type);
}

async function resolveProfile(
  profileIdOrExternalId: string
): Promise<{ profile: Profile | null }> {
  const pm = await getProfileManager();

  // Try internal ID first
  const byId = await pm.getProfile(profileIdOrExternalId);
  if (byId) {
    return { profile: byId };
  }

  // Fallback to externalId lookup
  const dbProfile = await getProfileByExternalId(profileIdOrExternalId);
  if (!dbProfile) {
    return { profile: null };
  }

  return {
    profile: {
      id: dbProfile.id,
      externalId: dbProfile.externalId,
      summary: dbProfile.summary,
      summaryVersion: dbProfile.summaryVersion ?? 0,
      summaryUpdatedAt: dbProfile.summaryUpdatedAt,
      createdAt: dbProfile.createdAt,
      updatedAt: dbProfile.updatedAt,
    },
  };
}

profiles.get('/api/profiles', async (c) => {
  const limit = parseLimit(c.req.query('limit'), 20, MAX_LIST_LIMIT);
  const offset = parseLimit(c.req.query('offset'), 0, Number.MAX_SAFE_INTEGER);
  const search = c.req.query('search')?.trim() || undefined;

  if (limit === null) {
    return sendError(c, 400, 'limit must be a non-negative integer', 'invalid_request_error', 'invalid_limit');
  }
  if (offset === null) {
    return sendError(c, 400, 'offset must be a non-negative integer', 'invalid_request_error', 'invalid_offset');
  }

  const { profiles: rows, total } = await listProfiles({ limit, offset, search });

  return c.json({
    profiles: rows.map((p) =>
      serializeProfile({
        id: p.id,
        externalId: p.externalId,
        summary: p.summary,
        summaryVersion: p.summaryVersion ?? 0,
        summaryUpdatedAt: p.summaryUpdatedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })
    ),
    total,
  });
});

profiles.post('/api/profiles', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return sendError(c, 400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json');
  }

  const externalIdRaw = (body as { externalId?: unknown }).externalId;
  if (typeof externalIdRaw !== 'string' || !externalIdRaw.trim()) {
    return sendError(
      c,
      400,
      'externalId is required and must be a non-empty string',
      'invalid_request_error',
      'invalid_external_id'
    );
  }

  const externalId = externalIdRaw.trim();
  try {
    const pm = await getProfileManager();
    const profile = await pm.getOrCreateProfile(externalId);
    return c.json({ profile: serializeProfile(profile) });
  } catch (error) {
    logger.error({ err: error, externalId }, 'Failed to create profile');
    return sendError(
      c,
      500,
      'Failed to create profile',
      'internal_error',
      'profile_create_failed'
    );
  }
});

profiles.get('/api/profiles/:id', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const pm = await getProfileManager();
  // Use Promise.all to avoid N+1 query problem
  const [traits, recentMemories] = await Promise.all([
    pm.getTraitEngine().getTraits(profile.id),
    pm.getMemoryEngine().getRecentMemories(profile.id, 10),
  ]);

  return c.json({
    profile: serializeProfile(profile),
    traits: traits.map(serializeTrait),
    recentMemories: recentMemories.map(serializeMemory),
  });
});

profiles.patch('/api/profiles/:id', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return sendError(c, 400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json');
  }

  const summary = (body as { summary?: unknown }).summary;

  if (summary !== undefined && typeof summary !== 'string') {
    return sendError(c, 400, 'summary must be a string', 'invalid_request_error', 'invalid_summary');
  }

  if (summary === undefined) {
    return sendError(c, 400, 'summary is required', 'invalid_request_error', 'missing_summary');
  }

  const pm = await getProfileManager();
  const updated = await pm.updateSummary(profile.id, summary);

  if (!updated) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  return c.json({ profile: serializeProfile(updated) });
});

profiles.delete('/api/profiles/:id', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const [traitCount, memoryCount, messageCount] = await Promise.all([
    countTraitsForProfile(profile.id),
    countMemoriesForProfile(profile.id),
    getMessageCount(profile.id),
  ]);

  const deleted = await deleteProfile(profile.id);

  if (!deleted) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  return c.json({
    success: true,
    deleted: {
      traits: traitCount,
      memories: memoryCount,
      messages: messageCount,
    },
  });
});

profiles.get('/api/profiles/:id/export', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const [traits, memories, messages] = await Promise.all([
    getTraitsForProfile(profile.id),
    getAllMemoriesForProfile(profile.id),
    getAllMessagesForProfile(profile.id),
  ]);

  return c.json({
    profile: serializeProfile(profile),
    traits: traits.map(serializeTrait),
    memories: memories.map(serializeMemory),
    messages: messages.map(serializeMessage),
    exportedAt: new Date().toISOString(),
  });
});

profiles.post('/api/profiles/:id/ingest', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return sendError(c, 400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json');
  }

  const data = (body as { data?: unknown }).data;
  const source = (body as { source?: unknown }).source;
  const metadata = (body as { metadata?: unknown }).metadata;
  const extractTraits = (body as { extractTraits?: unknown }).extractTraits;
  const extractMemories = (body as { extractMemories?: unknown }).extractMemories;

  // Validate required data field
  if (typeof data !== 'string' || !data.trim()) {
    return sendError(c, 400, 'data is required and must be a non-empty string', 'invalid_request_error', 'invalid_data');
  }

  // Validate data size (max 100KB)
  const MAX_DATA_SIZE = 100 * 1024;
  if (data.length > MAX_DATA_SIZE) {
    return sendError(
      c,
      400,
      `data size exceeds maximum of ${MAX_DATA_SIZE} bytes`,
      'invalid_request_error',
      'data_too_large'
    );
  }

  // Validate optional fields
  if (source !== undefined && typeof source !== 'string') {
    return sendError(c, 400, 'source must be a string', 'invalid_request_error', 'invalid_source');
  }

  if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null)) {
    return sendError(c, 400, 'metadata must be an object', 'invalid_request_error', 'invalid_metadata');
  }

  if (extractTraits !== undefined && typeof extractTraits !== 'boolean') {
    return sendError(c, 400, 'extractTraits must be a boolean', 'invalid_request_error', 'invalid_extract_traits');
  }

  if (extractMemories !== undefined && typeof extractMemories !== 'boolean') {
    return sendError(c, 400, 'extractMemories must be a boolean', 'invalid_request_error', 'invalid_extract_memories');
  }

  // Default to extracting both traits and memories
  const shouldExtractTraits = extractTraits !== false;
  const shouldExtractMemories = extractMemories !== false;

  const pm = await getProfileManager();

  // Convert the data into a message format for processing
  // We use a "user" role message since this represents user-generated data
  const messages = [{ role: 'user', content: data.trim() }];

  // Track what was created/updated
  const stats = {
    traitsCreated: 0,
    traitsUpdated: 0,
    memoriesCreated: 0,
  };

  let extractedTraits: TraitUpdate[] = [];
  let extractedMemories: Memory[] = [];

  // Extract traits if enabled
  if (shouldExtractTraits) {
    try {
      const traitEngine = pm.getTraitEngine();
      const existingTraits = await traitEngine.getTraits(profile.id);
      extractedTraits = await traitEngine.extractTraits(messages, existingTraits);

      if (extractedTraits.length > 0) {
        await traitEngine.applyUpdates(profile.id, extractedTraits);

        // Count creates vs updates
        for (const trait of extractedTraits) {
          if (trait.action === 'create') {
            stats.traitsCreated++;
          } else if (trait.action === 'update') {
            stats.traitsUpdated++;
          }
        }
      }
    } catch (error) {
      logger.error({ err: error, profileId: profile.id }, 'Trait extraction failed during ingest');
      return sendError(
        c,
        500,
        'Trait extraction failed',
        'internal_error',
        'extraction_error'
      );
    }
  }

  // Extract memories if enabled (synchronously for ingest endpoint)
  if (shouldExtractMemories) {
    try {
      const memoryEngine = pm.getMemoryEngine();

      // We need to store the messages first to get message IDs for source tracking
      await pm.storeConversation(profile.id, messages, `ingest-${Date.now()}`);

      const candidates = await memoryEngine.extractMemoriesFromMessages(messages);

      if (candidates.length > 0) {
        await memoryEngine.storeMemoryCandidates(profile.id, candidates);
        stats.memoriesCreated = candidates.length;

        // Fetch the newly created memories to return them
        extractedMemories = await memoryEngine.getRecentMemories(profile.id, candidates.length);
      }
    } catch (error) {
      logger.error({ err: error, profileId: profile.id }, 'Memory extraction failed during ingest');
      return sendError(
        c,
        500,
        'Memory extraction failed',
        'internal_error',
        'extraction_error'
      );
    }
  }

  // Return the results
  return c.json({
    profile: serializeProfile(profile),
    extracted: {
      traits: extractedTraits.map((t) => ({
        key: t.key,
        value: t.value,
        confidence: t.confidence,
        action: t.action,
      })),
      memories: extractedMemories.map(serializeMemory),
      stats,
    },
    source: source || null,
    metadata: metadata || null,
  });
});

profiles.get('/api/profiles/:id/traits', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const traits = await getTraitsForProfile(profile.id);
  return c.json({ traits: traits.map(serializeTrait) });
});

profiles.put('/api/profiles/:id/traits/:key', async (c) => {
  const { id, key } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return sendError(c, 400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json');
  }

  const value = (body as { value?: unknown }).value;
  const confidenceRaw = (body as { confidence?: unknown }).confidence;

  if (value === undefined) {
    return sendError(c, 400, 'value is required', 'invalid_request_error', 'missing_value');
  }

  if (
    confidenceRaw !== undefined &&
    (typeof confidenceRaw !== 'number' || confidenceRaw < 0 || confidenceRaw > 1)
  ) {
    return sendError(
      c,
      400,
      'confidence must be a number between 0 and 1',
      'invalid_request_error',
      'invalid_confidence'
    );
  }

  const confidence = typeof confidenceRaw === 'number' ? confidenceRaw : undefined;

  const pm = await getProfileManager();
  const traitEngine = pm.getTraitEngine();
  const schema = traitEngine.getSchema(key);
  const valueType = schema?.valueType ?? inferValueType(value);

  if (!valueType) {
    return sendError(c, 400, 'Unsupported value type', 'invalid_request_error', 'invalid_value_type');
  }

  const trait = await upsertTrait({
    profileId: profile.id,
    key,
    category: schema?.category ?? null,
    valueType,
    valueJson: value,
    confidence,
    source: 'manual',
  });

  return c.json({ trait: serializeTrait(trait) });
});

profiles.delete('/api/profiles/:id/traits/:key', async (c) => {
  const { id, key } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const deleted = await deleteTraitByKey(profile.id, key);

  if (!deleted) {
    return sendError(c, 404, 'Trait not found', 'not_found_error', 'trait_not_found');
  }

  return c.json({ success: true });
});

profiles.get('/api/profiles/:id/memories', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const limit = parseLimit(c.req.query('limit'), 50, 200);
  const type = c.req.query('type');

  if (limit === null) {
    return sendError(c, 400, 'limit must be a non-negative integer', 'invalid_request_error', 'invalid_limit');
  }

  if (type && !isValidMemoryType(type)) {
    return sendError(c, 400, 'type must be one of fact, preference, event, context', 'invalid_request_error', 'invalid_memory_type');
  }

  const memories = await getMemoriesForProfile(profile.id, {
    limit,
    type: type as MemoryType | undefined,
    minImportance: 0,
  });

  return c.json({ memories: memories.map(serializeMemory) });
});

profiles.post('/api/profiles/:id/memories', async (c) => {
  const { id } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return sendError(c, 400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json');
  }

  const content = (body as { content?: unknown }).content;
  const type = (body as { type?: unknown }).type;
  const importanceRaw = (body as { importance?: unknown }).importance;

  if (typeof content !== 'string' || !content.trim()) {
    return sendError(c, 400, 'content is required and must be a string', 'invalid_request_error', 'invalid_content');
  }

  if (typeof type !== 'string' || !isValidMemoryType(type)) {
    return sendError(c, 400, 'type must be one of fact, preference, event, context', 'invalid_request_error', 'invalid_memory_type');
  }

  if (importanceRaw !== undefined && typeof importanceRaw !== 'number') {
    return sendError(c, 400, 'importance must be a number between 0 and 1', 'invalid_request_error', 'invalid_importance');
  }

  const importance =
    typeof importanceRaw === 'number'
      ? Math.max(0, Math.min(1, importanceRaw))
      : 0.5;

  const memory = await createMemory({
    profileId: profile.id,
    content: content.trim(),
    type,
    importance,
  });

  return c.json({ memory: serializeMemory(memory) }, 201 as ContentfulStatusCode);
});

profiles.delete('/api/profiles/:id/memories/:memoryId', async (c) => {
  const { id, memoryId } = c.req.param();
  const { profile } = await resolveProfile(id);

  if (!profile) {
    return sendError(c, 404, 'Profile not found', 'not_found_error', 'profile_not_found');
  }

  const deleted = await deleteMemory(memoryId);

  if (!deleted) {
    return sendError(c, 404, 'Memory not found', 'not_found_error', 'memory_not_found');
  }

  return c.json({ success: true });
});

export default profiles;
