import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRetriever } from './retriever';

// Mock the @getprofile/db module
vi.mock('@getprofile/db', () => ({
  getMemoriesForProfile: vi.fn(),
  getRecentMemories: vi.fn(),
  touchMemory: vi.fn(),
}));

import {
  getMemoriesForProfile,
  getRecentMemories,
  touchMemory,
} from '@getprofile/db';

const mockGetMemoriesForProfile = vi.mocked(getMemoriesForProfile);
const mockGetRecentMemories = vi.mocked(getRecentMemories);
const mockTouchMemory = vi.mocked(touchMemory);

describe('MemoryRetriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retrieve', () => {
    it('should retrieve memories with default options', async () => {
      const retriever = new MemoryRetriever();
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
      mockTouchMemory.mockResolvedValue();

      const memories = await retriever.retrieve(profileId);

      expect(mockGetMemoriesForProfile).toHaveBeenCalledWith(profileId, {
        limit: 10,
        type: undefined,
        minImportance: 0.1,
      });
      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe('User likes TypeScript');
      expect(memories[0]?.type).toBe('preference');
      expect(memories[0]?.importance).toBe(0.8);
    });

    it('should retrieve memories with custom options', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      mockGetMemoriesForProfile.mockResolvedValue([]);

      await retriever.retrieve(profileId, 'test query', {
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

    it('should filter by memory type', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'User is a developer',
          type: 'fact',
          importance: 0.9,
          decayFactor: 1.0,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetMemoriesForProfile.mockResolvedValue(mockDbMemories);

      const memories = await retriever.retrieve(profileId, undefined, {
        type: 'fact',
      });

      expect(mockGetMemoriesForProfile).toHaveBeenCalledWith(
        profileId,
        expect.objectContaining({ type: 'fact' })
      );
      expect(memories).toHaveLength(1);
      expect(memories[0]?.type).toBe('fact');
    });

    it('should handle null importance and decayFactor', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'Memory with nulls',
          type: 'fact',
          importance: null,
          decayFactor: null,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetMemoriesForProfile.mockResolvedValue(mockDbMemories);

      const memories = await retriever.retrieve(profileId);

      expect(memories).toHaveLength(1);
      expect(memories[0]?.importance).toBe(0.5); // Default
      expect(memories[0]?.decayFactor).toBe(1.0); // Default
    });

    it('should handle empty sourceMessageIds', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'Memory without sources',
          type: 'fact',
          importance: 0.7,
          decayFactor: 1.0,
          sourceMessageIds: null,
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetMemoriesForProfile.mockResolvedValue(mockDbMemories);

      const memories = await retriever.retrieve(profileId);

      expect(memories).toHaveLength(1);
      expect(memories[0]?.sourceMessageIds).toEqual([]);
    });

    it('should touch memories in background', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'Memory 1',
          type: 'fact',
          importance: 0.8,
          decayFactor: 1.0,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
        {
          id: 'mem-2',
          profileId,
          content: 'Memory 2',
          type: 'fact',
          importance: 0.7,
          decayFactor: 1.0,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetMemoriesForProfile.mockResolvedValue(mockDbMemories);
      mockTouchMemory.mockResolvedValue();

      await retriever.retrieve(profileId);

      // Wait for setImmediate to execute
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockTouchMemory).toHaveBeenCalledWith('mem-1');
      expect(mockTouchMemory).toHaveBeenCalledWith('mem-2');
    });

    it('should not fail if touch memories fails', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'Memory',
          type: 'fact',
          importance: 0.8,
          decayFactor: 1.0,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetMemoriesForProfile.mockResolvedValue(mockDbMemories);
      mockTouchMemory.mockRejectedValue(new Error('Touch failed'));

      const memories = await retriever.retrieve(profileId);

      expect(memories).toHaveLength(1);

      // Wait for setImmediate
      await new Promise((resolve) => setImmediate(resolve));

      // Should not throw
      expect(mockTouchMemory).toHaveBeenCalled();
    });
  });

  describe('getRecent', () => {
    it('should get recent memories with default limit', async () => {
      const retriever = new MemoryRetriever();
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

      const memories = await retriever.getRecent(profileId);

      expect(mockGetRecentMemories).toHaveBeenCalledWith(profileId, 10);
      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe('Recent memory');
    });

    it('should get recent memories with custom limit', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';

      mockGetRecentMemories.mockResolvedValue([]);

      await retriever.getRecent(profileId, 20);

      expect(mockGetRecentMemories).toHaveBeenCalledWith(profileId, 20);
    });

    it('should map all memory fields correctly', async () => {
      const retriever = new MemoryRetriever();
      const profileId = 'profile-123';
      const now = new Date();

      const mockDbMemories = [
        {
          id: 'mem-1',
          profileId,
          content: 'Complete memory',
          type: 'event',
          importance: 0.85,
          decayFactor: 0.95,
          sourceMessageIds: ['msg-1', 'msg-2'],
          createdAt: now,
          lastAccessedAt: now,
        },
      ];

      mockGetRecentMemories.mockResolvedValue(mockDbMemories);

      const memories = await retriever.getRecent(profileId);

      expect(memories).toHaveLength(1);
      expect(memories[0]).toEqual({
        id: 'mem-1',
        profileId,
        content: 'Complete memory',
        type: 'event',
        importance: 0.85,
        decayFactor: 0.95,
        sourceMessageIds: ['msg-1', 'msg-2'],
        createdAt: now,
        lastAccessedAt: now,
      });
    });
  });
});
