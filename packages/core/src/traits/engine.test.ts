import { describe, it, expect, vi, beforeEach } from "vitest";
import { TraitEngine } from "./engine";
import { getDefaultTraitSchemas } from "./schema";

// Mock @getprofile/db
vi.mock("@getprofile/db", () => ({
  getTraitsForProfile: vi.fn().mockResolvedValue([]),
  upsertTrait: vi.fn().mockImplementation(async (_, input) => ({
    id: "trait-123",
    profileId: input.profileId,
    key: input.key,
    category: input.category ?? null,
    valueType: input.valueType,
    valueJson: input.valueJson,
    confidence: input.confidence ?? 0.5,
    source: input.source ?? "extracted",
    sourceMessageIds: input.sourceMessageIds ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  deleteTraitByKey: vi.fn().mockResolvedValue(true),
  bulkUpsertTraits: vi.fn().mockResolvedValue([]),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("TraitEngine", () => {
  let engine: TraitEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TraitEngine();
  });

  describe("constructor and schema loading", () => {
    it("should load default trait schemas", () => {
      const schemas = engine.getSchemas();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas.map((s) => s.key)).toContain("name");
      expect(schemas.map((s) => s.key)).toContain("communication_style");
      expect(schemas.map((s) => s.key)).toContain("expertise_level");
    });

    it("should get a specific schema by key", () => {
      const schema = engine.getSchema("name");
      expect(schema).toBeDefined();
      expect(schema?.valueType).toBe("string");
      expect(schema?.category).toBe("identity");
    });

    it("should return undefined for unknown schema key", () => {
      const schema = engine.getSchema("unknown_key");
      expect(schema).toBeUndefined();
    });
  });

  describe("extractTraits", () => {
    it("should return empty array when extraction is disabled", async () => {
      const disabledEngine = new TraitEngine({ extractionEnabled: false });
      const updates = await disabledEngine.extractTraits(
        [{ role: "user", content: "Hi, I'm Alex" }],
        []
      );
      expect(updates).toEqual([]);
    });

    it("should return empty array when no API key is configured", async () => {
      const originalEnv = process.env.LLM_API_KEY;
      delete process.env.LLM_API_KEY;

      try {
        const updates = await engine.extractTraits(
          [{ role: "user", content: "Hi, I'm Alex" }],
          []
        );

        expect(updates).toEqual([]);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.LLM_API_KEY;
        } else {
          process.env.LLM_API_KEY = originalEnv;
        }
      }
    });

    it("should call LLM and parse response when API key is set", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  key: "name",
                  value: "Alex",
                  confidence: 0.95,
                  action: "create",
                  reason: "User explicitly stated their name",
                },
              ]),
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const engineWithKey = new TraitEngine({
        llm: { apiKey: "test-key" },
      });

      const updates = await engineWithKey.extractTraits(
        [{ role: "user", content: "Hi, I'm Alex" }],
        []
      );

      expect(mockFetch).toHaveBeenCalled();
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        key: "name",
        value: "Alex",
        action: "create",
      });
    });

    it("should filter out traits below confidence threshold", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  key: "name",
                  value: "Alex",
                  confidence: 0.95, // Above threshold (0.9)
                  action: "create",
                },
                {
                  key: "expertise_level",
                  value: "beginner",
                  confidence: 0.3, // Below threshold (0.5)
                  action: "create",
                },
              ]),
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const engineWithKey = new TraitEngine({
        llm: { apiKey: "test-key" },
      });

      const updates = await engineWithKey.extractTraits(
        [{ role: "user", content: "Hi, I'm Alex" }],
        []
      );

      // Only name should pass (confidence 0.95 >= threshold 0.9)
      // expertise_level should be filtered (confidence 0.3 < threshold 0.5)
      expect(updates).toHaveLength(1);
      expect(updates[0]?.key).toBe("name");
    });

    it("should handle LLM response with markdown code block", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content:
                '```json\n[{"key": "name", "value": "Alex", "confidence": 0.95, "action": "create"}]\n```',
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const engineWithKey = new TraitEngine({
        llm: { apiKey: "test-key" },
      });

      const updates = await engineWithKey.extractTraits(
        [{ role: "user", content: "Hi, I'm Alex" }],
        []
      );

      expect(updates).toHaveLength(1);
      expect(updates[0]?.value).toBe("Alex");
    });

    it("should return empty array on LLM error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
      });

      const engineWithKey = new TraitEngine({
        llm: { apiKey: "test-key" },
      });

      const updates = await engineWithKey.extractTraits(
        [{ role: "user", content: "Hi, I'm Alex" }],
        []
      );

      expect(updates).toEqual([]);
    });
  });

  describe("buildInjectionContext", () => {
    it("should return empty string for empty traits", () => {
      const context = engine.buildInjectionContext([]);
      expect(context).toBe("");
    });

    it("should format traits using templates", () => {
      const traits = [
        {
          id: "1",
          profileId: "p1",
          key: "name",
          category: "identity",
          valueType: "string" as const,
          value: "Alex",
          confidence: 0.95,
          source: "extracted" as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          profileId: "p1",
          key: "communication_style",
          category: "communication",
          valueType: "enum" as const,
          value: "casual",
          confidence: 0.8,
          source: "extracted" as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = engine.buildInjectionContext(traits);
      expect(context).toContain("User's name is Alex");
      expect(context).toContain("User prefers casual communication style");
    });

    it("should sort by priority (higher first)", () => {
      const traits = [
        {
          id: "1",
          profileId: "p1",
          key: "interests",
          category: "preferences",
          valueType: "array" as const,
          value: ["coding", "music"],
          confidence: 0.6,
          source: "extracted" as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          profileId: "p1",
          key: "name",
          category: "identity",
          valueType: "string" as const,
          value: "Alex",
          confidence: 0.95,
          source: "extracted" as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = engine.buildInjectionContext(traits);
      const nameIndex = context.indexOf("Alex");
      const interestsIndex = context.indexOf("coding");

      // Name has priority 10, interests has priority 5
      expect(nameIndex).toBeLessThan(interestsIndex);
    });

    it("should filter out traits with low confidence", () => {
      const traits = [
        {
          id: "1",
          profileId: "p1",
          key: "name",
          category: "identity",
          valueType: "string" as const,
          value: "Alex",
          confidence: 0.2, // Very low, below 0.5 * 0.9 = 0.45
          source: "extracted" as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = engine.buildInjectionContext(traits);
      expect(context).not.toContain("Alex");
    });
  });
});

describe("getDefaultTraitSchemas", () => {
  it("should return all 8 default traits", () => {
    const schemas = getDefaultTraitSchemas();
    expect(schemas).toHaveLength(8);
  });

  it("should include required properties for each schema", () => {
    const schemas = getDefaultTraitSchemas();
    for (const schema of schemas) {
      expect(schema.key).toBeDefined();
      expect(schema.valueType).toBeDefined();
      expect(schema.extraction).toBeDefined();
      expect(schema.injection).toBeDefined();
    }
  });
});
