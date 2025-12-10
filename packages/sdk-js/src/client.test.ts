import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetProfileClient, GetProfileError } from "./client";
import type { ChatCompletion, ChatCompletionChunk } from "./types";

const mockFetch = vi.fn<
  [input: RequestInfo | URL, init?: RequestInit],
  Promise<Response>
>();

describe("GetProfileClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  function createResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("lists profiles with query parameters", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        profiles: [
          {
            id: "p1",
            externalId: "user-123",
            summary: null,
            summaryVersion: 0,
            summaryUpdatedAt: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
      })
    );

    const client = new GetProfileClient({
      apiKey: "test-key",
      baseUrl: "https://api.test.com",
    });

    const result = await client.profiles.list({
      limit: 10,
      offset: 5,
      search: "alex",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test.com/api/profiles?limit=10&offset=5&search=alex",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
    expect(result.total).toBe(1);
    expect(result.profiles[0]?.id).toBe("p1");
  });

  it("creates or retrieves a profile via getOrCreate", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        profile: {
          id: "p1",
          externalId: "user-123",
          summary: null,
          summaryVersion: 0,
          summaryUpdatedAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const profile = await client.profiles.getOrCreate("  user-123  ");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.yourserver.com/api/profiles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ externalId: "user-123" }),
      })
    );
    expect(profile.id).toBe("p1");
  });

  it("creates chat completions (non-streaming)", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 1,
        model: "gpt-5-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello!" },
            finish_reason: "stop",
          },
        ],
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const completion = (await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "Hi" }],
    })) as ChatCompletion;

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.yourserver.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(completion.choices[0]?.message.content).toBe("Hello!");
  });

  it("returns null from getProfile when API responds with 404", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({ error: { message: "not found" } }, 404)
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const result = await client.getProfile("missing");
    expect(result).toBeNull();
  });

  it("updates traits via traits.update", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        trait: {
          id: "t1",
          profileId: "p1",
          key: "name",
          category: null,
          valueType: "string",
          value: "Jamie",
          confidence: 0.9,
          source: "manual",
          sourceMessageIds: [],
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const trait = await client.traits.update("p1", "name", {
      value: "Jamie",
      confidence: 0.9,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.yourserver.com/api/profiles/p1/traits/name",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ value: "Jamie", confidence: 0.9 }),
      })
    );
    expect(trait.value).toBe("Jamie");
  });

  it("creates memories via memories.create", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        memory: {
          id: "m1",
          profileId: "p1",
          content: "User likes TypeScript",
          type: "fact",
          importance: 0.6,
          decayFactor: 1,
          sourceMessageIds: [],
          createdAt: "2024-01-01T00:00:00.000Z",
          lastAccessedAt: null,
        },
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const memory = await client.memories.create("p1", {
      content: "User likes TypeScript",
      type: "fact",
      importance: 0.6,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.yourserver.com/api/profiles/p1/memories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "User likes TypeScript",
          type: "fact",
          importance: 0.6,
        }),
      })
    );
    expect(memory.type).toBe("fact");
  });

  it("streams chat completions when stream is true", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"model":"gpt-5-mini","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const iterable = (await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: true,
    })) as AsyncIterable<ChatCompletionChunk>;

    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.choices[0]?.delta?.content).toBe("Hello");
  });

  it("lists models via models.list", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        object: "list",
        data: [{ id: "gpt-5-mini", object: "model" }],
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    const models = await client.models.list();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.yourserver.com/v1/models",
      expect.objectContaining({ method: "GET" })
    );
    expect(models.data[0]?.id).toBe("gpt-5-mini");
  });

  it("throws GetProfileError for API errors", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse(
        { error: { message: "invalid request", code: "bad_request" } },
        400
      )
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    await expect(client.traits.list("missing")).rejects.toThrow(
      GetProfileError
    );
  });

  it("retries on 5xx responses", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createResponse({ error: { message: "oops" } }, 500)
      )
      .mockResolvedValueOnce(
        createResponse({
          traits: [],
        })
      );

    const client = new GetProfileClient({
      apiKey: "test-key",
      retries: 1,
      retryDelayMs: 1,
    });

    await client.traits.list("p1");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("ingests data via ingestData helper", async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        profile: {
          id: "p1",
          externalId: "user-123",
          summary: null,
          summaryVersion: 0,
          summaryUpdatedAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
        extracted: {
          traits: [],
          memories: [],
          stats: {
            traitsCreated: 0,
            traitsUpdated: 0,
            memoriesCreated: 0,
          },
        },
        source: "crm",
        metadata: { foo: "bar" },
      })
    );

    const client = new GetProfileClient({ apiKey: "test-key" });
    await client.ingestData("p1", "Some CRM text", {
      source: "crm",
      metadata: { foo: "bar" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.yourserver.com/api/profiles/p1/ingest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          data: "Some CRM text",
          source: "crm",
          metadata: { foo: "bar" },
          extractTraits: undefined,
          extractMemories: undefined,
        }),
      })
    );
  });

  it("validates ingest payload is non-empty", async () => {
    const client = new GetProfileClient({ apiKey: "test-key" });
    expect(() => client.ingestData("p1", "")).toThrow(TypeError);
  });
});
