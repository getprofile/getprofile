import { describe, it, expect, beforeEach, vi } from "vitest";
import { TraitEngine } from "./engine";
import type { TraitSchema, Trait } from "../types";

// Mock the database functions
vi.mock("@getprofile/db", () => ({
  getTraitsForProfile: vi.fn().mockResolvedValue([]),
  upsertTrait: vi.fn().mockImplementation((data) =>
    Promise.resolve({
      id: "trait-1",
      profileId: data.profileId,
      key: data.key,
      category: data.category,
      valueType: data.valueType,
      valueJson: data.valueJson,
      confidence: data.confidence,
      source: data.source,
      sourceMessageIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
  deleteTraitByKey: vi.fn().mockResolvedValue(undefined),
}));

describe("TraitEngine - Custom Schemas", () => {
  let engine: TraitEngine;

  beforeEach(() => {
    engine = new TraitEngine({
      extractionEnabled: true,
      llm: {
        apiKey: "test-key",
        model: "gpt-5-mini",
      },
    });
  });

  describe("buildInjectionContext with custom schemas", () => {
    it("should use custom schemas for injection formatting", () => {
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
            template: "Custom: {{value}}",
            priority: 10,
          },
        },
      ];

      const traits: Trait[] = [
        {
          id: "trait-1",
          profileId: "profile-1",
          key: "custom_trait",
          category: null,
          valueType: "string",
          value: "test value",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = engine.buildInjectionContext(traits, customSchemas);
      expect(result).toBe("Custom: test value");
    });

    it("should filter traits not in custom schemas", () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "allowed_trait",
          valueType: "string",
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: true,
            template: "Allowed: {{value}}",
            priority: 5,
          },
        },
      ];

      const traits: Trait[] = [
        {
          id: "trait-1",
          profileId: "profile-1",
          key: "allowed_trait",
          category: null,
          valueType: "string",
          value: "allowed",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "trait-2",
          profileId: "profile-1",
          key: "other_trait",
          category: null,
          valueType: "string",
          value: "other",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = engine.buildInjectionContext(traits, customSchemas);
      expect(result).toBe("Allowed: allowed");
      expect(result).not.toContain("other");
    });

    it("should respect priority from custom schemas", () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "high_priority",
          valueType: "string",
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: true,
            template: "High: {{value}}",
            priority: 10,
          },
        },
        {
          key: "low_priority",
          valueType: "string",
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: true,
            template: "Low: {{value}}",
            priority: 1,
          },
        },
      ];

      const traits: Trait[] = [
        {
          id: "trait-1",
          profileId: "profile-1",
          key: "low_priority",
          category: null,
          valueType: "string",
          value: "low",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "trait-2",
          profileId: "profile-1",
          key: "high_priority",
          category: null,
          valueType: "string",
          value: "high",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = engine.buildInjectionContext(traits, customSchemas);
      // High priority should come first
      expect(result).toBe("High: high\nLow: low");
    });

    it("should skip traits with injection disabled in custom schemas", () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "disabled_trait",
          valueType: "string",
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: false,
            template: "Should not appear: {{value}}",
            priority: 5,
          },
        },
      ];

      const traits: Trait[] = [
        {
          id: "trait-1",
          profileId: "profile-1",
          key: "disabled_trait",
          category: null,
          valueType: "string",
          value: "test",
          confidence: 0.9,
          source: "extracted",
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = engine.buildInjectionContext(traits, customSchemas);
      expect(result).toBe("");
    });
  });

  describe("applyUpdates with custom schemas", () => {
    it("should use custom schema metadata when applying updates", async () => {
      const { upsertTrait } = await import("@getprofile/db");

      const customSchemas: TraitSchema[] = [
        {
          key: "custom_trait",
          valueType: "number",
          category: "custom_category",
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

      const updates = [
        {
          key: "custom_trait",
          value: 42,
          confidence: 0.8,
          action: "create" as const,
        },
      ];

      await engine.applyUpdates("profile-1", updates, customSchemas);

      expect(upsertTrait).toHaveBeenCalledWith({
        profileId: "profile-1",
        key: "custom_trait",
        category: "custom_category",
        valueType: "number",
        valueJson: 42,
        confidence: 0.8,
        source: "extracted",
      });
    });

    it("should fall back to default schemas when custom schemas not provided", async () => {
      const { upsertTrait } = await import("@getprofile/db");

      const updates = [
        {
          key: "name",
          value: "Alice",
          confidence: 0.9,
          action: "create" as const,
        },
      ];

      await engine.applyUpdates("profile-1", updates);

      expect(upsertTrait).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "profile-1",
          key: "name",
          valueJson: "Alice",
          confidence: 0.9,
          source: "extracted",
        })
      );
    });
  });

  describe("extractAndApply with custom schemas", () => {
    it("should pass custom schemas through the extraction pipeline", async () => {
      const customSchemas: TraitSchema[] = [
        {
          key: "travel_preference",
          valueType: "string",
          extraction: {
            enabled: true,
            promptSnippet: "Extract travel preferences",
            confidenceThreshold: 0.6,
          },
          injection: {
            enabled: true,
            template: "Prefers: {{value}}",
            priority: 8,
          },
        },
      ];

      const messages = [{ role: "user", content: "I love beach vacations" }];

      // Mock the LLM call to return a valid extraction
      const mockExtractTraits = vi.spyOn(
        engine as unknown as { extractTraits: (messages: unknown[], existingTraits: unknown[], schemas?: TraitSchema[]) => Promise<unknown[]> },
        "extractTraits"
      );
      mockExtractTraits.mockResolvedValue([]);

      await engine.extractAndApply("profile-1", messages, customSchemas);

      // Verify extractTraits was called with custom schemas
      expect(mockExtractTraits).toHaveBeenCalledWith(
        messages,
        expect.any(Array),
        customSchemas
      );
    });
  });
});
