// Database schema for GetProfile
// Based on the technical plan

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  integer,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================
// PROFILES
// ============================================

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalId: text('external_id').notNull().unique(),

    // Pre-computed summary for fast injection
    summary: text('summary'),
    summaryVersion: integer('summary_version').default(0),
    summaryUpdatedAt: timestamp('summary_updated_at'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    externalIdIdx: index('profiles_external_id_idx').on(table.externalId),
  })
);

// ============================================
// TRAITS
// ============================================

export const traits = pgTable(
  'traits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),

    // Trait identification
    key: text('key').notNull(),
    category: text('category'),

    // Value (flexible storage)
    valueType: text('value_type').notNull(),
    valueJson: jsonb('value_json').notNull(),

    // Confidence & provenance
    confidence: real('confidence').default(0.5),
    source: text('source'),
    sourceMessageIds: jsonb('source_message_ids'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint needed for ON CONFLICT in upsert operations
    profileKeyUnique: uniqueIndex('traits_profile_key_idx').on(table.profileId, table.key),
  })
);

// ============================================
// MESSAGES (Conversation History)
// ============================================

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),

    // Message content
    role: text('role').notNull(),
    content: text('content').notNull(),

    // Request context
    requestId: text('request_id'),
    model: text('model'),

    // Processing state
    processed: boolean('processed').default(false),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    profileCreatedIdx: index('messages_profile_created_idx').on(
      table.profileId,
      table.createdAt
    ),
  })
);

// ============================================
// MEMORIES (Extracted Facts)
// ============================================

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),

    // Memory content
    content: text('content').notNull(),
    type: text('type').notNull(),

    // Importance & decay
    importance: real('importance').default(0.5),
    decayFactor: real('decay_factor').default(1.0),

    // Source tracking
    sourceMessageIds: jsonb('source_message_ids'),

    // Vector embedding placeholder (for semantic search - Phase 2)
    // embedding: vector('embedding', { dimensions: 1536 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
  },
  (table) => ({
    profileTypeIdx: index('memories_profile_type_idx').on(
      table.profileId,
      table.type
    ),
    profileImportanceIdx: index('memories_profile_importance_idx').on(
      table.profileId,
      table.importance
    ),
  })
);

// Note: Trait schemas are loaded from JSON configuration files (config/traits/*.json)
// rather than stored in the database. This keeps the schema system simple and
// version-controllable. See packages/core/src/traits/schema.ts for the embedded defaults.

// Note: Authentication is handled via GETPROFILE_API_KEY environment variable.
// No API keys are stored in the database - this is a self-hosted system.

