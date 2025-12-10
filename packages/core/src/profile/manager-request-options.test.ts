import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileManager } from "./manager";
import type { TraitSchema } from "../types";

// Mock database functions
vi.mock("@getprofile/db", () => ({
  getOrCreateProfile: vi.fn().mockResolvedValue({
    id: "profile-1",
    externalId: "user-123",
    summary: null,
    summaryVersion: 0,
    summaryUpdatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getProfileById: vi.fn().mockResolvedValue({
    id: "profile-1",
    externalId: "user-123",
    summary: "Test user profile",
    summaryVersion: 1,
    summaryUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getTraitsForProfile: vi.fn().mockResolvedValue([]),
  bulkCreateMessages: vi.fn().mockImplementation((profileId, messages) =>
    Promise.resolve(
      messages.map((msg: { role: string; content: string }, i: number) => ({
        id: `msg-${i}`,
        profileId,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(),
        requestId: null,
        model: null,
        processed: false,
      }))
    )
  ),
  getMessageCount: vi.fn().mockResolvedValue(0),
  upsertTrait: vi.fn().mockImplementation((data) =>
    Promise.resolve({
      id: "trait-1",
      ...data,
      sourceMessageIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
}));

// Mock memory engine methods
vi.mock("../memory/engine", () => ({
  MemoryEngine: vi.fn().mockImplementation(() => ({
    retrieveMemories: vi.fn().mockResolvedValue([]),
    getProfileSummary: vi.fn().mockResolvedValue("Test summary"),
    processMessages: vi.fn().mockResolvedValue([]),
    getRecentMemories: vi.fn().mockResolvedValue([]),
    regenerateSummary: vi.fn().mockResolvedValue("Regenerated summary"),
  })),
}));

describe("ProfileManager - Request Options", () => {
  let manager: ProfileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ProfileManager({
      traitExtractionEnabled: true,
      memoryExtractionEnabled: true,
      llm: {
        apiKey: "test-key",
        model: "gpt-5-mini",
      },
    });
  });

  describe("buildInjectionText with custom schemas", () => {
    it("should use custom schemas for trait injection", async () => {
      const { getTraitsForProfile } = await import("@getprofile/db");

      // Mock existing traits
      vi.mocked(getTraitsForProfile).mockResolvedValueOnce([
        {
          id: "trait-1",
          profileId: "profile-1",
          key: "custom_trait",
          category: null,
          valueType: "string",
          valueJson: "custom value",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const customSchemas: TraitSchema[] = [
        {
          key: "custom_trait",
          valueType: "string",
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: true,
            template: "User has custom trait: {{value}}",
            priority: 10,
          },
        },
      ];

      const result = await manager.buildInjectionText(
        "profile-1",
        undefined,
        customSchemas
      );

      expect(result).toContain("User has custom trait: custom value");
    });

    it("should work without custom schemas", async () => {
      const result = await manager.buildInjectionText("profile-1");
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });

  describe("processConversation with skipExtraction", () => {
    it("should skip trait extraction when skipExtraction is true", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = await manager.processConversation("profile-1", messages, {
        skipExtraction: true,
      });

      expect(result.stored).toBe(true);
      expect(result.traitsExtracted).toEqual([]);
    });

    it("should extract traits when skipExtraction is false", async () => {
      const messages = [
        { role: "user", content: "I'm Alex" },
        { role: "assistant", content: "Nice to meet you, Alex!" },
      ];

      // Mock trait extraction
      const extractAndApplySpy = vi.spyOn(
        manager.getTraitEngine(),
        "extractAndApply"
      );
      extractAndApplySpy.mockResolvedValue([
        {
          key: "name",
          value: "Alex",
          confidence: 0.95,
          action: "create",
        },
      ]);

      const result = await manager.processConversation("profile-1", messages, {
        skipExtraction: false,
      });

      expect(result.stored).toBe(true);
      expect(extractAndApplySpy).toHaveBeenCalled();
      expect(result.traitsExtracted).toHaveLength(1);
      expect(result.traitsExtracted[0]?.key).toBe("name");
    });

    it("should extract traits by default when skipExtraction is not provided", async () => {
      const messages = [
        { role: "user", content: "I'm a developer" },
        { role: "assistant", content: "Great!" },
      ];

      const extractAndApplySpy = vi.spyOn(
        manager.getTraitEngine(),
        "extractAndApply"
      );
      extractAndApplySpy.mockResolvedValue([]);

      await manager.processConversation("profile-1", messages);

      expect(extractAndApplySpy).toHaveBeenCalled();
    });
  });

  describe("processConversation with custom schemas", () => {
    it("should pass custom schemas to trait extraction", async () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "travel_style",
          valueType: "string",
          extraction: {
            enabled: true,
            promptSnippet: "Extract travel preferences",
            confidenceThreshold: 0.6,
          },
          injection: {
            enabled: true,
            template: "Prefers {{value}} travel",
            priority: 7,
          },
        },
      ];

      const messages = [
        { role: "user", content: "I love adventure travel" },
        { role: "assistant", content: "That sounds exciting!" },
      ];

      const extractAndApplySpy = vi.spyOn(
        manager.getTraitEngine(),
        "extractAndApply"
      );
      extractAndApplySpy.mockResolvedValue([
        {
          key: "travel_style",
          value: "adventure",
          confidence: 0.8,
          action: "create",
        },
      ]);

      const result = await manager.processConversation("profile-1", messages, {
        customTraitSchemas: customSchemas,
      });

      expect(extractAndApplySpy).toHaveBeenCalledWith(
        "profile-1",
        messages,
        customSchemas
      );
      expect(result.traitsExtracted[0]?.key).toBe("travel_style");
    });

    it("should use default schemas when custom schemas not provided", async () => {
      const messages = [
        { role: "user", content: "My name is Bob" },
        { role: "assistant", content: "Hello Bob!" },
      ];

      const extractAndApplySpy = vi.spyOn(
        manager.getTraitEngine(),
        "extractAndApply"
      );
      extractAndApplySpy.mockResolvedValue([]);

      await manager.processConversation("profile-1", messages);

      expect(extractAndApplySpy).toHaveBeenCalledWith(
        "profile-1",
        messages,
        undefined
      );
    });
  });

  describe("combined options", () => {
    it("should handle both skipExtraction and custom schemas", async () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "test_trait",
          valueType: "string",
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: true,
            priority: 5,
          },
        },
      ];

      const messages = [
        { role: "user", content: "Test message" },
        { role: "assistant", content: "Response" },
      ];

      const extractAndApplySpy = vi.spyOn(
        manager.getTraitEngine(),
        "extractAndApply"
      );

      const result = await manager.processConversation("profile-1", messages, {
        skipExtraction: true,
        customTraitSchemas: customSchemas,
      });

      // Should not call extraction when skipExtraction is true
      expect(extractAndApplySpy).not.toHaveBeenCalled();
      expect(result.traitsExtracted).toEqual([]);
    });

    it("should apply custom schemas when skipExtraction is false", async () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "mood",
          valueType: "enum",
          enumValues: ["happy", "sad", "neutral"],
          extraction: {
            enabled: true,
            confidenceThreshold: 0.7,
          },
          injection: {
            enabled: true,
            priority: 6,
          },
        },
      ];

      const messages = [
        { role: "user", content: "I'm feeling great today!" },
        { role: "assistant", content: "That's wonderful!" },
      ];

      const extractAndApplySpy = vi.spyOn(
        manager.getTraitEngine(),
        "extractAndApply"
      );
      extractAndApplySpy.mockResolvedValue([
        {
          key: "mood",
          value: "happy",
          confidence: 0.9,
          action: "create",
        },
      ]);

      const result = await manager.processConversation("profile-1", messages, {
        skipExtraction: false,
        customTraitSchemas: customSchemas,
      });

      expect(extractAndApplySpy).toHaveBeenCalledWith(
        "profile-1",
        messages,
        customSchemas
      );
      expect(result.traitsExtracted[0]?.key).toBe("mood");
    });
  });
});
