// Core types for GetProfile
// Based on the technical plan: Profile, Trait, Memory, Config types

export interface Profile {
  id: string;
  externalId: string;
  summary: string | null;
  summaryVersion: number;
  summaryUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileWithTraits extends Profile {
  traits: Trait[];
}

export interface ProfileContext {
  profile: Profile;
  traits: Trait[];
  recentMemories: Memory[];
  summary: string;
}

export type TraitValueType = 'string' | 'number' | 'boolean' | 'array' | 'enum';

export interface Trait {
  id: string;
  profileId: string;
  key: string;
  category: string | null;
  valueType: TraitValueType;
  value: unknown;
  confidence: number;
  source: 'extracted' | 'manual' | 'inferred';
  sourceMessageIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TraitSchema {
  key: string;
  label?: string;
  description?: string;
  valueType: TraitValueType;
  enumValues?: string[];
  extraction: {
    enabled: boolean;
    promptSnippet?: string;
    confidenceThreshold: number;
  };
  injection: {
    enabled: boolean;
    template?: string;
    priority: number;
  };
  category?: string;
}

export interface TraitUpdate {
  key: string;
  value: unknown;
  confidence: number;
  action: 'create' | 'update' | 'delete';
  reason?: string;
}

export type MemoryType = 'fact' | 'preference' | 'event' | 'context';

export interface Memory {
  id: string;
  profileId: string;
  content: string;
  type: MemoryType;
  importance: number;
  decayFactor: number;
  sourceMessageIds: string[];
  createdAt: Date;
  lastAccessedAt: Date | null;
}

export interface MemoryCandidate {
  content: string;
  type: MemoryType;
  importance: number;
  sourceMessageIds: string[];
}

// GetProfileConfig type definition
// NOTE: This should match the Zod schema in @getprofile/config/src/schema.ts
// The config package uses Zod for validation, but we define the type here to avoid
// circular dependencies and build order issues.
export interface GetProfileConfig {
  database: {
    url: string;
    poolSize?: number;
    idle_timeout?: number;
    connect_timeout?: number;
  };
  llm: {
    provider: 'openai' | 'anthropic' | 'custom';
    apiKey?: string;
    model: string;
    baseUrl?: string;
  };
  upstream: {
    provider: 'openai' | 'anthropic' | 'custom';
    apiKey?: string;
    baseUrl?: string;
  };
  memory: {
    maxMessagesPerProfile: number;
    extractionEnabled: boolean;
    summarizationInterval: number;
    retentionDays?: number;
  };
  traits: {
    schemaPath?: string;
    extractionEnabled: boolean;
    defaultTraitsEnabled: boolean;
    allowRequestOverride: boolean;
  };
  prompts?: {
    extractionPath?: string;
    traitExtractionPath?: string;
    summarizationPath?: string;
  };
  server: {
    port: number;
    host: string;
  };
}
