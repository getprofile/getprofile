import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryExtractor } from "./extractor";

// Mock fetch globally
global.fetch = vi.fn();

describe("MemoryExtractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const extractor = new MemoryExtractor();
      expect(extractor).toBeInstanceOf(MemoryExtractor);
    });

    it("should create with custom config", () => {
      const extractor = new MemoryExtractor({
        llm: { apiKey: "test-key", model: "gpt-4" },
        extractionEnabled: true,
      });
      expect(extractor).toBeInstanceOf(MemoryExtractor);
    });

    it("should accept custom prompt", () => {
      const customPrompt = "Custom extraction prompt: {{conversation}}";
      const extractor = new MemoryExtractor({ customPrompt });
      expect(extractor).toBeInstanceOf(MemoryExtractor);
    });
  });

  describe("extract", () => {
    it("should return empty array when extraction is disabled", async () => {
      const extractor = new MemoryExtractor({ extractionEnabled: false });
      const messages = [{ role: "user", content: "Hello" }];

      const memories = await extractor.extract(messages);

      expect(memories).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should return empty array when no API key is configured", async () => {
      const extractor = new MemoryExtractor();
      const messages = [{ role: "user", content: "Hello" }];

      // Ensure no API key in env
      const oldKey = process.env.LLM_API_KEY;
      delete process.env.LLM_API_KEY;

      const memories = await extractor.extract(messages);

      expect(memories).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();

      // Restore env
      if (oldKey) process.env.LLM_API_KEY = oldKey;
    });

    it("should extract memories successfully", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [
        { role: "user", content: "I work as a software engineer" },
      ];
      const messageIds = ["msg-1"];

      const mockResponse = [
        {
          content: "User works as a software engineer",
          type: "fact",
          importance: 0.8,
        },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages, messageIds);

      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe("User works as a software engineer");
      expect(memories[0]?.type).toBe("fact");
      expect(memories[0]?.importance).toBe(0.8);
      expect(memories[0]?.sourceMessageIds).toEqual(["msg-1"]);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should handle response wrapped in markdown code blocks", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "I like TypeScript" }];

      const mockResponse = [
        {
          content: "User likes TypeScript",
          type: "preference",
          importance: 0.7,
        },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\``,
              },
            },
          ],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe("User likes TypeScript");
    });

    it("should filter out invalid memory types", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "Test" }];

      const mockResponse = [
        {
          content: "Valid memory",
          type: "fact",
          importance: 0.8,
        },
        {
          content: "Invalid type",
          type: "invalid_type",
          importance: 0.5,
        },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe("Valid memory");
    });

    it("should filter out invalid importance scores", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "Test" }];

      const mockResponse = [
        {
          content: "Valid importance",
          type: "fact",
          importance: 0.5,
        },
        {
          content: "Importance too high",
          type: "fact",
          importance: 1.5,
        },
        {
          content: "Negative importance",
          type: "fact",
          importance: -0.1,
        },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe("Valid importance");
    });

    it("should abort LLM request after configured timeout", async () => {
      vi.useFakeTimers();
      const extractor = new MemoryExtractor({
        llm: { apiKey: "test-key", timeoutMs: 10 },
      });
      const messages = [{ role: "user", content: "Test timeout" }];

      vi.mocked(fetch).mockImplementation((_, options?: RequestInit) => {
        const signal = options?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }) as Promise<Response>;
      });

      const extractionPromise = extractor.extract(messages);

      await vi.advanceTimersByTimeAsync(20);

      await expect(extractionPromise).resolves.toEqual([]);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should return empty array on LLM API error", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "Test" }];

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toEqual([]);
    });

    it("should return empty array on JSON parse error", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "Test" }];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Not valid JSON" } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toEqual([]);
    });

    it("should handle empty array response", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "Test" }];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toEqual([]);
    });

    it("should use custom model and baseUrl if provided", async () => {
      const extractor = new MemoryExtractor({
        llm: {
          apiKey: "test-key",
          model: "gpt-4",
          baseUrl: "https://custom.api.com/v1",
        },
      });
      const messages = [{ role: "user", content: "Test" }];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }],
        }),
      } as Response);

      await extractor.extract(messages);

      expect(fetch).toHaveBeenCalledWith(
        "https://custom.api.com/v1/chat/completions",
        expect.objectContaining({
          body: expect.stringContaining('"model":"gpt-4"'),
        })
      );
    });

    it("should handle all valid memory types", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [{ role: "user", content: "Test" }];

      const mockResponse = [
        { content: "Fact memory", type: "fact", importance: 0.8 },
        { content: "Preference memory", type: "preference", importance: 0.7 },
        { content: "Event memory", type: "event", importance: 0.6 },
        { content: "Context memory", type: "context", importance: 0.5 },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toHaveLength(4);
      expect(memories.map((m) => m.type)).toEqual([
        "fact",
        "preference",
        "event",
        "context",
      ]);
    });

    it("should only extract from user messages, not assistant messages", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [
        { role: "user", content: "I work as a software engineer" },
        { role: "assistant", content: "That's great! How long have you been in this field?" },
        { role: "user", content: "About 5 years now" },
      ];

      const mockResponse = [
        {
          content: "User works as a software engineer",
          type: "fact",
          importance: 0.8,
        },
        {
          content: "User has 5 years of experience",
          type: "fact",
          importance: 0.7,
        },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      } as Response);

      const memories = await extractor.extract(messages);

      expect(memories).toHaveLength(2);
      // Verify that fetch was called with only user messages in the prompt
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall?.[1]?.body as string);
      const promptContent = requestBody.messages[1].content;

      // The prompt should contain user messages but not assistant messages
      expect(promptContent).toContain("I work as a software engineer");
      expect(promptContent).toContain("About 5 years now");
      expect(promptContent).not.toContain("That's great! How long have you been in this field?");
    });

    it("should return empty array when only assistant messages are provided", async () => {
      const extractor = new MemoryExtractor({ llm: { apiKey: "test-key" } });
      const messages = [
        { role: "assistant", content: "Hello! How can I help you?" },
        { role: "assistant", content: "I'm here to assist." },
      ];

      const memories = await extractor.extract(messages);

      expect(memories).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
