// SDK public types. These mirror the REST API responses.

export interface GetProfileClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelayMs?: number;
  fetch?: typeof fetch;
  defaultHeaders?: Record<string, string>;
}

export type TraitValueType = "string" | "number" | "boolean" | "array" | "enum";
export type MemoryType = "fact" | "preference" | "event" | "context";

/**
 * Schema definition for a trait.
 * Used to define how traits should be extracted and injected into conversations.
 */
export interface TraitSchema {
  /** Unique identifier for the trait */
  key: string;
  /** Human-readable label for the trait */
  label?: string;
  /** Description of what this trait represents */
  description?: string;
  /** Data type of the trait value */
  valueType: TraitValueType;
  /** Valid values for enum type traits */
  enumValues?: string[];
  /** Category for organizing traits */
  category?: string;
  /** Configuration for extracting this trait from conversations */
  extraction: {
    /** Whether extraction is enabled for this trait */
    enabled: boolean;
    /** Optional prompt snippet for LLM extraction */
    promptSnippet?: string;
    /** Minimum confidence threshold (0.0-1.0) required to accept extracted values */
    confidenceThreshold: number;
  };
  /** Configuration for injecting this trait into conversations */
  injection: {
    /** Whether to inject this trait into prompts */
    enabled: boolean;
    /** Template for formatting the trait in prompts (use {{value}} placeholder) */
    template?: string;
    /** Priority for ordering injected traits (higher = first) */
    priority: number;
  };
}

/**
 * Per-request GetProfile options that can be included in chat completion requests.
 * These options modify GetProfile behavior for a specific request.
 */
export interface GetProfileRequestOptions {
  /**
   * Custom trait schemas for this request only.
   * Overrides the default trait schemas configured on the server.
   *
   * @example
   * ```typescript
   * const response = await client.chat.completions.create({
   *   model: 'gpt-5-mini',
   *   messages: [{ role: 'user', content: 'Help me plan my trip' }],
   *   getprofile: {
   *     traits: [{
   *       key: 'travel_preferences',
   *       valueType: 'array',
   *       extraction: { enabled: true, confidenceThreshold: 0.5 },
   *       injection: { enabled: true, template: 'User prefers: {{value}}', priority: 5 }
   *     }]
   *   }
   * });
   * ```
   */
  traits?: TraitSchema[];

  /**
   * Skip profile context injection for this request.
   * When true, the request is forwarded without adding user profile context.
   * Useful for raw LLM requests that don't need personalization.
   *
   * @example
   * ```typescript
   * const response = await client.chat.completions.create({
   *   model: 'gpt-5-mini',
   *   messages: [{ role: 'user', content: 'What is 2+2?' }],
   *   getprofile: { skipInjection: true }
   * });
   * ```
   */
  skipInjection?: boolean;

  /**
   * Skip background trait and memory extraction for this request.
   * When true, messages are not stored and no traits are extracted.
   * Useful for temporary or sensitive conversations.
   *
   * @example
   * ```typescript
   * const response = await client.chat.completions.create({
   *   model: 'gpt-5-mini',
   *   messages: [{ role: 'user', content: 'Temporary question' }],
   *   getprofile: { skipExtraction: true }
   * });
   * ```
   */
  skipExtraction?: boolean;
}

export interface ProfileSummary {
  id: string;
  externalId: string;
  summary: string | null;
  summaryVersion: number;
  summaryUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileListResponse {
  profiles: ProfileSummary[];
  total: number;
}

export interface ProfileDetail {
  profile: ProfileSummary;
  traits: Trait[];
  recentMemories: Memory[];
}

export interface Trait {
  id: string;
  profileId: string;
  key: string;
  category: string | null;
  valueType: TraitValueType;
  value: unknown;
  confidence: number;
  source: "extracted" | "manual" | "inferred";
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  profileId: string;
  content: string;
  type: MemoryType;
  importance: number;
  decayFactor: number;
  sourceMessageIds: string[];
  createdAt: string;
  lastAccessedAt: string | null;
}

export type ChatCompletionMessageRole = "system" | "user" | "assistant";

export type ChatCompletionMessageContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
        detail?: "auto" | "low" | "high";
      };
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export interface ChatCompletionMessageParam {
  role: ChatCompletionMessageRole;
  content: string | ChatCompletionMessageContentPart[];
  name?: string;
}

export interface ChatCompletionCreateParamsBase {
  model: string;
  messages: ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
  /** GetProfile-specific options for per-request customization */
  getprofile?: GetProfileRequestOptions;
  [key: string]: unknown;
}

export interface ChatCompletionCreateParamsStreaming
  extends ChatCompletionCreateParamsBase {
  stream: true;
}

export interface ChatCompletionCreateParamsNonStreaming
  extends ChatCompletionCreateParamsBase {
  stream?: false;
}

export type ChatCompletionCreateParams =
  | ChatCompletionCreateParamsStreaming
  | ChatCompletionCreateParamsNonStreaming;

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessageParam;
  finish_reason: string | null;
  logprobs?: Record<string, unknown> | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<ChatCompletionMessageParam>;
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface Model {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  [key: string]: unknown;
}

export interface ModelsListResponse {
  object: string;
  data: Model[];
}

export interface MessageRecord {
  id: string;
  profileId: string;
  role: "system" | "user" | "assistant";
  content: string;
  requestId: string | null;
  model: string | null;
  processed: boolean;
  createdAt: string;
}

export interface ProfileExport {
  profile: ProfileSummary;
  traits: Trait[];
  memories: Memory[];
  messages: MessageRecord[];
  exportedAt: string;
}

export interface DeleteProfileResult {
  success: boolean;
  deleted: {
    traits: number;
    memories: number;
    messages: number;
  };
}

export interface TraitListResponse {
  traits: Trait[];
}

export interface TraitResponse {
  trait: Trait;
}

export interface MemoryListResponse {
  memories: Memory[];
}

export interface MemoryResponse {
  memory: Memory;
}

export interface IngestDataOptions {
  source?: string;
  metadata?: Record<string, unknown>;
  extractTraits?: boolean;
  extractMemories?: boolean;
}

export interface IngestResult {
  profile: ProfileSummary;
  extracted: {
    traits: Array<{
      key: string;
      value: unknown;
      confidence: number;
      action: "create" | "update";
    }>;
    memories: Memory[];
    stats: {
      traitsCreated: number;
      traitsUpdated: number;
      memoriesCreated: number;
    };
  };
  source: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ListProfilesOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface ListMemoriesOptions {
  type?: MemoryType;
  limit?: number;
}

export interface CreateMemoryInput {
  content: string;
  type: MemoryType;
  importance?: number;
}

export interface UpdateTraitInput {
  value: unknown;
  confidence?: number;
}
