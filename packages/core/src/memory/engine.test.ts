import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryEngine } from './engine';

// Mock the @getprofile/db module
vi.mock('@getprofile/db', () => ({
  bulkCreateMemories: vi.fn(),
  findSimilarMemory: vi.fn(),
  getMemoriesForProfile: vi.fn(),
  getRecentMemories: vi.fn(),
  touchMemory: vi.fn(),
  getProfileById: vi.fn(),
  updateProfile: vi.fn(),
}));

import {
  bulkCreateMemories,
  getMemoriesForProfile,
  getRecentMemories,
  getProfileById,
  updateProfile,
} from '@getprofile/db';

const mockBulkCreateMemories = vi.mocked(bulkCreateMemories);
const mockGetMemoriesForProfile = vi.mocked(getMemoriesForProfile);
const mockGetRecentMemories = vi.mocked(getRecentMemories);
const mockGetProfileById = vi.mocked(getProfileById);
const mockUpdateProfile = vi.mocked(updateProfile);

describe('MemoryEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const engine = new MemoryEngine();
      expect(engine).toBeInstanceOf(MemoryEngine);
    });

    it('should create with custom config', () => {
      const engine = new MemoryEngine({
        llm: { apiKey: 'test-key' },
        extractionEnabled: false,
        summarizationInterval: 120,
      });
      expect(engine).toBeInstanceOf(MemoryEngine);
    });

    it('should throw error for invalid summarizationInterval', () => {
      expect(() => new MemoryEngine({ summarizationInterval: 0 })).toThrow(
        'Invalid summarizationInterval'
      );
      expect(() => new MemoryEngine({ summarizationInterval: -1 })).toThrow(
        'Invalid summarizationInterval'
      );
      expect(() => new MemoryEngine({ summarizationInterval: NaN })).toThrow(
        'Invalid summarizationInterval'
      );
    });
  });

  describe('processMessages', () => {
    it('should skip extraction when disabled in config', async () => {
      const engine = new MemoryEngine({ extractionEnabled: false });
      const profileId = 'profile-123';
      const messages = [
        { role: 'user', content: 'Hello', id: 'msg-1' },
        { role: 'assistant', content: 'Hi there!', id: 'msg-2' },
      ];

      await engine.processMessages(profileId, messages);

      expect(mockBulkCreateMemories).not.toHaveBeenCalled();
    });

    it('should skip extraction when skipExtraction option is true', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';
      const messages = [{ role: 'user', content: 'Hello', id: 'msg-1' }];

      await engine.processMessages(profileId, messages, { skipExtraction: true });

      expect(mockBulkCreateMemories).not.toHaveBeenCalled();
    });

    it('should process messages without API key', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';
      const messages = [{ role: 'user', content: 'Hello', id: 'msg-1' }];

      await engine.processMessages(profileId, messages);

      // Should not throw, but won't extract without API key
      expect(mockBulkCreateMemories).not.toHaveBeenCalled();
    });

    it.todo(
      'should deduplicate memories before storing (requires extractor injection)'
    );
  });

  describe('retrieveMemories', () => {
    it('should retrieve memories with default options', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'User likes TypeScript',
          type: 'preference',
          importance: 0.8,
          decayFactor: 1.0,
          sourceMessageIds: ['msg-1'],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetMemoriesForProfile.mockResolvedValue(mockDbMemories);

      const memories = await engine.retrieveMemories(profileId);

      expect(mockGetMemoriesForProfile).toHaveBeenCalledWith(profileId, {
        limit: 10,
        type: undefined,
        minImportance: 0.1,
      });
      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe('User likes TypeScript');
    });

    it('should retrieve memories with custom options', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';

      mockGetMemoriesForProfile.mockResolvedValue([]);

      await engine.retrieveMemories(profileId, 'test query', {
        limit: 5,
        type: 'fact',
        minImportance: 0.5,
      });

      expect(mockGetMemoriesForProfile).toHaveBeenCalledWith(profileId, {
        limit: 5,
        type: 'fact',
        minImportance: 0.5,
      });
    });
  });

  describe('getRecentMemories', () => {
    it('should get recent memories with default limit', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'Recent memory',
          type: 'fact',
          importance: 0.5,
          decayFactor: 1.0,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetRecentMemories.mockResolvedValue(mockDbMemories);

      const memories = await engine.getRecentMemories(profileId);

      expect(mockGetRecentMemories).toHaveBeenCalledWith(profileId, 10);
      expect(memories).toHaveLength(1);
    });

    it('should get recent memories with custom limit', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';

      mockGetRecentMemories.mockResolvedValue([]);

      await engine.getRecentMemories(profileId, 20);

      expect(mockGetRecentMemories).toHaveBeenCalledWith(profileId, 20);
    });
  });

  describe('getProfileSummary', () => {
    it('should return cached summary if fresh', async () => {
      const engine = new MemoryEngine();
      const profileId = 'profile-123';
      const traits = [
        {
          id: 'trait-1',
          profileId,
          key: 'name',
          category: 'identity',
          valueType: 'string' as const,
          value: 'Alice',
          confidence: 0.9,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const memories: never[] = [];

      mockGetProfileById.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'Cached summary',
        summaryVersion: 1,
        summaryUpdatedAt: new Date(), // Recent
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await engine.getProfileSummary(profileId, traits, memories);

      expect(summary).toBe('Cached summary');
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('should generate new summary if stale', async () => {
      // Save and clear environment variables to ensure no API key is used
      const savedLLMKey = process.env.LLM_API_KEY;
      const savedOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const engine = new MemoryEngine({ summarizationInterval: 1 });
        const profileId = 'profile-123';
        const traits = [
          {
            id: 'trait-1',
            profileId,
            key: 'name',
            category: 'identity',
            valueType: 'string' as const,
            value: 'Bob',
            confidence: 0.9,
            source: 'extracted' as const,
            sourceMessageIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
        const memories: never[] = [];

        // Mock old summary
        const oldDate = new Date();
        oldDate.setHours(oldDate.getHours() - 2); // 2 hours ago

        mockGetProfileById.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: 'Old summary',
          summaryVersion: 1,
          summaryUpdatedAt: oldDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockUpdateProfile.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: 'This is Bob.',
          summaryVersion: 1,
          summaryUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const summary = await engine.getProfileSummary(profileId, traits, memories);

        // Should generate basic summary (no API key)
        expect(summary).toContain('Bob');
        expect(mockUpdateProfile).toHaveBeenCalled();
      } finally {
        // Restore environment variables
        if (savedLLMKey) process.env.LLM_API_KEY = savedLLMKey;
        if (savedOpenAIKey) process.env.OPENAI_API_KEY = savedOpenAIKey;
      }
    });
  });

  describe('regenerateSummary', () => {
    it('should force regenerate summary', async () => {
      // Save and clear environment variables to ensure no API key is used
      const savedLLMKey = process.env.LLM_API_KEY;
      const savedOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const engine = new MemoryEngine();
        const profileId = 'profile-123';
        const traits = [
          {
            id: 'trait-1',
            profileId,
            key: 'name',
            category: 'identity',
            valueType: 'string' as const,
            value: 'Charlie',
            confidence: 0.9,
            source: 'extracted' as const,
            sourceMessageIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
        const memories: never[] = [];

        mockUpdateProfile.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: 'This is Charlie.',
          summaryVersion: 1,
          summaryUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const summary = await engine.regenerateSummary(profileId, traits, memories);

        expect(summary).toContain('Charlie');
        expect(mockUpdateProfile).toHaveBeenCalled();
      } finally {
        // Restore environment variables
        if (savedLLMKey) process.env.LLM_API_KEY = savedLLMKey;
        if (savedOpenAIKey) process.env.OPENAI_API_KEY = savedOpenAIKey;
      }
    });
  });
});
