// Lightweight TypeScript SDK for GetProfile REST API.
// Provides typed helpers for working with profiles, traits, and memories.

import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  CreateMemoryInput,
  DeleteProfileResult,
  GetProfileClientOptions,
  IngestDataOptions,
  IngestResult,
  ListMemoriesOptions,
  ListProfilesOptions,
  Memory,
  MemoryListResponse,
  MemoryResponse,
  ModelsListResponse,
  ProfileDetail,
  ProfileExport,
  ProfileListResponse,
  ProfileSummary,
  Trait,
  TraitListResponse,
  TraitResponse,
  UpdateTraitInput,
} from "./types";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

interface HttpRequestOptions {
  method?: RequestInit["method"];
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  rawResponse?: boolean;
}

interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  retries: number;
  retryDelayMs: number;
  fetchImpl: FetchLike;
  defaultHeaders: Record<string, string>;
}

interface ApiErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  [key: string]: unknown;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Custom error class for GetProfile API errors.
 * Extends the native Error class with additional context about API failures.
 */
export class GetProfileError extends Error {
  /** HTTP status code of the error response */
  readonly status: number;
  /** Error code from the API response */
  readonly code?: string;
  /** Error type classification */
  readonly errorType?: string;
  /** Additional error details from the API */
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    errorType?: string,
    details?: unknown
  ) {
    super(message);
    this.name = "GetProfileError";
    this.status = status;
    this.code = code;
    this.errorType = errorType;
    this.details = details;
  }
}

class HttpClient {
  private readonly baseUrl: string;

  constructor(private readonly config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.endsWith("/")
      ? config.baseUrl
      : `${config.baseUrl}/`;
  }

  async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      ...this.config.defaultHeaders,
      ...(options.headers ?? {}),
    };

    const maxAttempts = Math.max(1, this.config.retries + 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { signal, cleanup } = this.createAbortSignal();
      try {
        const response = await this.config.fetchImpl(url, {
          method: options.method ?? "GET",
          headers,
          body: this.serializeBody(options.body),
          signal: signal ?? undefined,
        });

        if (response.ok) {
          cleanup();
          if (options.rawResponse) {
            return response as unknown as T;
          }
          return (await this.parseResponse<T>(response)) as T;
        }

        if (this.shouldRetry(response.status) && attempt < maxAttempts - 1) {
          cleanup();
          await this.delay(attempt);
          continue;
        }

        cleanup();
        throw await this.buildError(response);
      } catch (error) {
        cleanup();

        if (error instanceof GetProfileError) {
          throw error;
        }

        if (attempt < maxAttempts - 1 && this.isRetryableError(error)) {
          await this.delay(attempt);
          continue;
        }

        throw this.wrapNetworkError(error);
      }
    }

    // Should be unreachable due to the loop structure.
    throw new GetProfileError(
      "Request failed",
      0,
      "unknown_error",
      "unknown_error"
    );
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(
      path.startsWith("http") ? path : path.replace(/^\//, ""),
      this.baseUrl
    );

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.append(key, String(value));
      }
    }

    return url.toString();
  }

  private serializeBody(body: unknown): string | undefined {
    if (body === undefined) {
      return undefined;
    }
    if (typeof body === "string") {
      return body;
    }
    return JSON.stringify(body);
  }

  private async parseResponse<T>(response: Response): Promise<T | undefined> {
    if (response.status === 204) {
      return undefined;
    }

    const text = await response.text();
    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      // Non-JSON responses are unexpected but return raw text for debugging.
      return text as unknown as T;
    }
  }

  private async buildError(response: Response): Promise<GetProfileError> {
    const payload = (await this.parseResponse<ApiErrorResponse>(response)) as
      | ApiErrorResponse
      | undefined;
    const message =
      payload?.error?.message ??
      `Request failed with status ${response.status}`;
    const code = payload?.error?.code;
    const type = payload?.error?.type;

    return new GetProfileError(message, response.status, code, type, payload);
  }

  private wrapNetworkError(error: unknown): GetProfileError {
    if (error instanceof GetProfileError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : "Network request failed";
    return new GetProfileError(message, 0, "network_error", "network_error", {
      cause: error,
    });
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof GetProfileError) {
      return false;
    }
    if (error instanceof Error && error.name === "AbortError") {
      return true;
    }
    return true;
  }

  private async delay(attempt: number) {
    const base = Math.max(this.config.retryDelayMs, 50);
    const backoff = base * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }

  private createAbortSignal(): {
    signal?: AbortSignal;
    cleanup: () => void;
  } {
    if (this.config.timeout <= 0 || typeof AbortController === "undefined") {
      return { signal: undefined, cleanup: () => {} };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timeoutId),
    };
  }
}

class ProfilesResource {
  constructor(private readonly http: HttpClient) {}

  list(options?: ListProfilesOptions): Promise<ProfileListResponse> {
    return this.http.request<ProfileListResponse>("/api/profiles", {
      query: {
        limit: options?.limit,
        offset: options?.offset,
        search: options?.search,
      },
    });
  }

  async getOrCreate(externalId: string): Promise<ProfileSummary> {
    if (typeof externalId !== "string" || !externalId.trim()) {
      throw new TypeError("externalId must be a non-empty string");
    }

    const response = await this.http.request<{ profile: ProfileSummary }>(
      "/api/profiles",
      {
        method: "POST",
        body: { externalId: externalId.trim() },
      }
    );
    return response.profile;
  }

  get(profileIdOrExternalId: string): Promise<ProfileDetail> {
    return this.http.request<ProfileDetail>(
      `/api/profiles/${encodeSegment(profileIdOrExternalId)}`
    );
  }

  updateSummary(profileId: string, summary: string): Promise<ProfileSummary> {
    if (!summary || typeof summary !== "string") {
      throw new TypeError("summary must be a non-empty string");
    }

    return this.http
      .request<{ profile: ProfileSummary }>(
        `/api/profiles/${encodeSegment(profileId)}`,
        {
          method: "PATCH",
          body: { summary },
        }
      )
      .then((res) => res.profile);
  }

  delete(profileId: string): Promise<DeleteProfileResult> {
    return this.http.request<DeleteProfileResult>(
      `/api/profiles/${encodeSegment(profileId)}`,
      {
        method: "DELETE",
      }
    );
  }

  export(profileId: string): Promise<ProfileExport> {
    return this.http.request<ProfileExport>(
      `/api/profiles/${encodeSegment(profileId)}/export`
    );
  }

  ingest(
    profileId: string,
    data: string,
    options?: IngestDataOptions
  ): Promise<IngestResult> {
    if (!data || typeof data !== "string" || !data.trim()) {
      throw new TypeError("data must be a non-empty string");
    }

    return this.http.request<IngestResult>(
      `/api/profiles/${encodeSegment(profileId)}/ingest`,
      {
        method: "POST",
        body: {
          data,
          source: options?.source,
          metadata: options?.metadata,
          extractTraits: options?.extractTraits,
          extractMemories: options?.extractMemories,
        },
      }
    );
  }
}

class TraitsResource {
  constructor(private readonly http: HttpClient) {}

  async list(profileId: string): Promise<Trait[]> {
    const res = await this.http.request<TraitListResponse>(
      `/api/profiles/${encodeSegment(profileId)}/traits`
    );
    return res.traits;
  }

  async update(
    profileId: string,
    key: string,
    input: UpdateTraitInput
  ): Promise<Trait> {
    const res = await this.http.request<TraitResponse>(
      `/api/profiles/${encodeSegment(profileId)}/traits/${encodeSegment(key)}`,
      {
        method: "PUT",
        body: {
          value: input.value,
          confidence: input.confidence,
        },
      }
    );
    return res.trait;
  }

  async delete(profileId: string, key: string): Promise<boolean> {
    await this.http.request<{ success: boolean }>(
      `/api/profiles/${encodeSegment(profileId)}/traits/${encodeSegment(key)}`,
      { method: "DELETE" }
    );
    return true;
  }
}

class MemoriesResource {
  constructor(private readonly http: HttpClient) {}

  async list(
    profileId: string,
    options?: ListMemoriesOptions
  ): Promise<Memory[]> {
    const res = await this.http.request<MemoryListResponse>(
      `/api/profiles/${encodeSegment(profileId)}/memories`,
      {
        query: {
          type: options?.type,
          limit: options?.limit,
        },
      }
    );
    return res.memories;
  }

  async create(profileId: string, input: CreateMemoryInput): Promise<Memory> {
    const res = await this.http.request<MemoryResponse>(
      `/api/profiles/${encodeSegment(profileId)}/memories`,
      {
        method: "POST",
        body: {
          content: input.content,
          type: input.type,
          importance: input.importance,
        },
      }
    );
    return res.memory;
  }

  async delete(profileId: string, memoryId: string): Promise<boolean> {
    await this.http.request<{ success: boolean }>(
      `/api/profiles/${encodeSegment(profileId)}/memories/${encodeSegment(memoryId)}`,
      { method: "DELETE" }
    );
    return true;
  }
}

class ChatCompletionsResource {
  constructor(private readonly http: HttpClient) {}

  async create(
    params: ChatCompletionCreateParamsStreaming
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  async create(
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<ChatCompletion>;
  async create(
    params: ChatCompletionCreateParams
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    if (params.stream) {
      const response = await this.http.request<Response>(
        "/v1/chat/completions",
        {
          method: "POST",
          body: params,
          rawResponse: true,
        }
      );
      return this.streamResponse(response);
    }

    return this.http.request<ChatCompletion>("/v1/chat/completions", {
      method: "POST",
      body: params,
    });
  }

  private streamResponse(
    response: Response
  ): AsyncIterable<ChatCompletionChunk> {
    if (!response.body) {
      throw new GetProfileError(
        "Streaming is not supported in this environment",
        0,
        "stream_error",
        "stream_error"
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const parseBuffer = (
      buffer: string
    ): { events: string[]; remaining: string } => {
      const events: string[] = [];
      let working = buffer;

      while (true) {
        const separatorIndex = working.indexOf("\n\n");
        if (separatorIndex === -1) break;
        const chunk = working.slice(0, separatorIndex);
        working = working.slice(separatorIndex + 2);
        const normalized = chunk.replace(/\r/g, "");
        const dataLines = normalized
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());
        if (dataLines.length === 0) continue;
        events.push(dataLines.join("\n"));
      }

      return { events, remaining: working };
    };

    const parseChunk = (payload: string): ChatCompletionChunk => {
      try {
        return JSON.parse(payload) as ChatCompletionChunk;
      } catch (error) {
        throw new GetProfileError(
          "Failed to parse streaming chunk",
          0,
          "stream_error",
          "stream_error",
          { cause: error, payload }
        );
      }
    };

    const iterator = async function* (): AsyncGenerator<ChatCompletionChunk> {
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            const { events } = parseBuffer(buffer);
            for (const data of events) {
              if (data === "[DONE]") {
                return;
              }
              yield parseChunk(data);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseBuffer(buffer);
          buffer = remaining;
          for (const data of events) {
            if (data === "[DONE]") {
              return;
            }
            yield parseChunk(data);
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    return {
      [Symbol.asyncIterator]() {
        return iterator();
      },
    };
  }
}

class ChatResource {
  readonly completions: ChatCompletionsResource;

  constructor(http: HttpClient) {
    this.completions = new ChatCompletionsResource(http);
  }
}

class ModelsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<ModelsListResponse> {
    return this.http.request<ModelsListResponse>("/v1/models");
  }
}

/**
 * GetProfile API Client
 *
 * Main client for interacting with the GetProfile API. Provides access to profiles,
 * traits, memories, and OpenAI-compatible chat completions with automatic profile context.
 *
 * @example
 * ```typescript
 * const client = new GetProfileClient({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://api.yourserver.com' // optional
 * });
 *
 * // Create or get a profile
 * const profile = await client.getOrCreateProfile('user-123');
 *
 * // Ingest data to extract traits and memories
 * await client.ingestData(profile.id, 'User prefers dark mode and codes in TypeScript');
 *
 * // Get chat completion with profile context
 * const completion = await client.chat.completions.create({
 *   model: 'gpt-5-mini',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   user: profile.externalId
 * });
 *
 * // Use per-request trait overrides for custom extraction
 * const tripResponse = await client.chat.completions.create({
 *   model: 'gpt-5-mini',
 *   messages: [{ role: 'user', content: 'Help me plan my vacation' }],
 *   user: profile.externalId,
 *   getprofile: {
 *     traits: [{
 *       key: 'travel_preferences',
 *       valueType: 'object',
 *       extraction: { enabled: true, confidenceThreshold: 0.6 },
 *       injection: { enabled: true, template: 'Travel style: {{value}}', priority: 8 }
 *     }]
 *   }
 * });
 *
 * // Skip injection for raw LLM requests
 * const rawResponse = await client.chat.completions.create({
 *   model: 'gpt-5-mini',
 *   messages: [{ role: 'user', content: 'What is 2+2?' }],
 *   getprofile: { skipInjection: true }
 * });
 *
 * // Skip extraction for temporary conversations
 * const tempResponse = await client.chat.completions.create({
 *   model: 'gpt-5-mini',
 *   messages: [{ role: 'user', content: 'Sensitive data...' }],
 *   user: profile.externalId,
 *   getprofile: { skipExtraction: true }
 * });
 * ```
 */
export class GetProfileClient {
  /** Resource for managing user profiles */
  readonly profiles: ProfilesResource;
  /** Resource for managing user traits */
  readonly traits: TraitsResource;
  /** Resource for managing user memories */
  readonly memories: MemoriesResource;
  /** Resource for OpenAI-compatible chat completions with profile context */
  readonly chat: ChatResource;
  /** Resource for listing available models */
  readonly models: ModelsResource;

  private readonly http: HttpClient;

  /**
   * Creates a new GetProfile client instance.
   *
   * @param options - Configuration options for the client
   * @param options.apiKey - Your GetProfile API key (required)
   * @param options.baseUrl - Base URL for the API (default: 'https://api.yourserver.com')
   * @param options.timeout - Request timeout in milliseconds (default: 30000)
   * @param options.retries - Number of retry attempts for failed requests (default: 1)
   * @param options.retryDelayMs - Initial retry delay in milliseconds (default: 250)
   * @param options.fetch - Custom fetch implementation (default: globalThis.fetch)
   * @param options.defaultHeaders - Additional headers to include in all requests
   *
   * @throws {Error} If apiKey is not provided
   * @throws {Error} If fetch implementation is not available
   */
  constructor(options: GetProfileClientOptions) {
    if (!options?.apiKey) {
      throw new Error("apiKey is required to initialize GetProfileClient");
    }

    const fetchImpl: FetchLike | undefined = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error(
        "Fetch API is not available. Provide a fetch implementation via options.fetch."
      );
    }

    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? "https://api.yourserver.com",
      apiKey: options.apiKey,
      timeout: options.timeout ?? 30_000,
      retries: options.retries ?? 1,
      retryDelayMs: options.retryDelayMs ?? 250,
      fetchImpl,
      defaultHeaders: options.defaultHeaders ?? {},
    });

    this.profiles = new ProfilesResource(this.http);
    this.traits = new TraitsResource(this.http);
    this.memories = new MemoriesResource(this.http);
    this.chat = new ChatResource(this.http);
    this.models = new ModelsResource(this.http);
  }

  /**
   * Ingests arbitrary text data to extract traits and memories for a profile.
   *
   * @param profileId - The ID of the profile to ingest data for
   * @param data - The text data to analyze and extract from
   * @param options - Optional configuration for ingestion
   * @returns Ingestion result with extracted traits and memories
   *
   * @example
   * ```typescript
   * const result = await client.ingestData(
   *   'profile-123',
   *   'User loves hiking and prefers email notifications',
   *   { source: 'onboarding', extractTraits: true, extractMemories: true }
   * );
   * console.log(result.extracted.stats);
   * ```
   */
  ingestData(
    profileId: string,
    data: string,
    options?: IngestDataOptions
  ): Promise<IngestResult> {
    return this.profiles.ingest(profileId, data, options);
  }

  /**
   * Fetches a profile by ID or external ID. Returns null if not found instead of throwing.
   *
   * @param profileIdOrExternalId - The profile ID or external ID
   * @returns The profile details, or null if not found
   *
   * @example
   * ```typescript
   * const profile = await client.getProfile('user-123');
   * if (profile) {
   *   console.log(profile.profile.summary);
   * }
   * ```
   */
  async getProfile(
    profileIdOrExternalId: string
  ): Promise<ProfileDetail | null> {
    try {
      return await this.profiles.get(profileIdOrExternalId);
    } catch (error) {
      if (error instanceof GetProfileError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Gets an existing profile or creates a new one if it doesn't exist.
   *
   * @param externalId - Your application's user identifier
   * @returns The profile summary
   *
   * @example
   * ```typescript
   * const profile = await client.getOrCreateProfile('user-123');
   * console.log(profile.id); // GetProfile's internal ID
   * ```
   */
  getOrCreateProfile(externalId: string): Promise<ProfileSummary> {
    return this.profiles.getOrCreate(externalId);
  }

  /**
   * Lists all profiles with optional filtering and pagination.
   *
   * @param options - Optional query parameters for filtering and pagination
   * @returns List of profiles and total count
   *
   * @example
   * ```typescript
   * const result = await client.listProfiles({ limit: 10, offset: 0, search: 'john' });
   * console.log(`Found ${result.total} profiles`);
   * ```
   */
  listProfiles(options?: ListProfilesOptions): Promise<ProfileListResponse> {
    return this.profiles.list(options);
  }

  /**
   * Deletes a profile and all associated data (traits, memories, messages).
   *
   * @param profileId - The ID of the profile to delete
   * @returns Deletion result with counts of deleted records
   *
   * @example
   * ```typescript
   * const result = await client.deleteProfile('profile-123');
   * console.log(`Deleted ${result.deleted.traits} traits`);
   * ```
   */
  deleteProfile(profileId: string): Promise<DeleteProfileResult> {
    return this.profiles.delete(profileId);
  }

  /**
   * Exports all profile data including traits, memories, and message history.
   *
   * @param profileId - The ID of the profile to export
   * @returns Complete profile export with all associated data
   *
   * @example
   * ```typescript
   * const export = await client.exportProfile('profile-123');
   * console.log(export.traits.length, 'traits exported');
   * ```
   */
  exportProfile(profileId: string): Promise<ProfileExport> {
    return this.profiles.export(profileId);
  }
}
