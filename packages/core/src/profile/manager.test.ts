import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProfileManager } from './manager';

// Mock the @getprofile/db module
vi.mock('@getprofile/db', () => {
  return {
    getOrCreateProfile: vi.fn(),
    getProfileById: vi.fn(),
    updateProfile: vi.fn(),
    getTraitsForProfile: vi.fn(),
    bulkCreateMessages: vi.fn(),
    getRecentMessages: vi.fn(),
    getMemoriesForProfile: vi.fn(),
    getMessageCount: vi.fn(),
    deleteOldMessages: vi.fn(),
  };
});

import {
  getOrCreateProfile,
  getProfileById,
  updateProfile,
  getTraitsForProfile,
  bulkCreateMessages,
  getRecentMessages,
  getMemoriesForProfile,
  getMessageCount,
  deleteOldMessages,
} from '@getprofile/db';

const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockGetProfileById = vi.mocked(getProfileById);
const mockUpdateProfile = vi.mocked(updateProfile);
const mockGetTraitsForProfile = vi.mocked(getTraitsForProfile);
const mockBulkCreateMessages = vi.mocked(bulkCreateMessages);
const mockGetRecentMessages = vi.mocked(getRecentMessages);
const mockGetMemoriesForProfile = vi.mocked(getMemoriesForProfile);
const mockGetMessageCount = vi.mocked(getMessageCount);
const mockDeleteOldMessages = vi.mocked(deleteOldMessages);

describe('ProfileManager', () => {
  let manager: ProfileManager;
  const profileId = 'profile-456';
  const externalId = 'user-789';

  const mockDbProfile = {
    id: profileId,
    externalId,
    summary: 'Test user summary',
    summaryVersion: 1,
    summaryUpdatedAt: new Date(), // Recent date to avoid summary regeneration
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for getMemoriesForProfile to return empty array
    mockGetMemoriesForProfile.mockResolvedValue([]);
    mockGetMessageCount.mockResolvedValue(0);
    mockDeleteOldMessages.mockResolvedValue(0);
    manager = new ProfileManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getOrCreateProfile', () => {
    it('should get or create a profile and return mapped result', async () => {
      mockGetOrCreateProfile.mockResolvedValue(mockDbProfile);

      const profile = await manager.getOrCreateProfile(externalId);

      expect(mockGetOrCreateProfile).toHaveBeenCalledWith(externalId);
      expect(profile).toEqual({
        id: profileId,
        externalId,
        summary: 'Test user summary',
        summaryVersion: 1,
        summaryUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('getProfile', () => {
    it('should return null if profile not found', async () => {
      mockGetProfileById.mockResolvedValue(null);

      const profile = await manager.getProfile(profileId);

      expect(profile).toBeNull();
    });

    it('should return mapped profile if found', async () => {
      mockGetProfileById.mockResolvedValue(mockDbProfile);

      const profile = await manager.getProfile(profileId);

      expect(profile).not.toBeNull();
      expect(profile?.id).toBe(profileId);
    });
  });

  describe('buildContext', () => {
    it('should throw if profile not found', async () => {
      mockGetProfileById.mockResolvedValue(null);

      await expect(manager.buildContext(profileId)).rejects.toThrow(
        'Profile not found'
      );
    });

    it('should build context with profile, traits, and summary', async () => {
      mockGetProfileById.mockResolvedValue(mockDbProfile);
      mockGetTraitsForProfile.mockResolvedValue([
        {
          id: 'trait-1',
          profileId,
          key: 'name',
          category: 'identity',
          valueType: 'string',
          valueJson: 'Alice',
          confidence: 0.9,
          source: 'extracted',
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const context = await manager.buildContext(profileId);

      expect(context.profile.id).toBe(profileId);
      expect(context.traits).toHaveLength(1);
      expect(context.traits[0]!.key).toBe('name');
      expect(context.recentMemories).toEqual([]);
      expect(context.summary).toBe('Test user summary');
    });

    it('should generate basic summary from traits if no summary exists', async () => {
      const profileWithoutSummary = { ...mockDbProfile, summary: null };
      mockGetProfileById.mockResolvedValue(profileWithoutSummary);
      mockGetTraitsForProfile.mockResolvedValue([
        {
          id: 'trait-1',
          profileId,
          key: 'name',
          category: 'identity',
          valueType: 'string',
          valueJson: 'Bob',
          confidence: 0.9,
          source: 'extracted',
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'trait-2',
          profileId,
          key: 'communication_style',
          category: 'communication',
          valueType: 'enum',
          valueJson: 'casual',
          confidence: 0.7,
          source: 'extracted',
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const context = await manager.buildContext(profileId);

      expect(context.summary).toContain('Bob');
      expect(context.summary).toContain('casual');
    });
  });

  describe('buildInjectionText', () => {
    it('should build injection text from profile context', async () => {
      mockGetProfileById.mockResolvedValue(mockDbProfile);
      mockGetTraitsForProfile.mockResolvedValue([
        {
          id: 'trait-1',
          profileId,
          key: 'expertise_level',
          category: 'context',
          valueType: 'enum',
          valueJson: 'advanced',
          confidence: 0.8,
          source: 'extracted',
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const text = await manager.buildInjectionText(profileId);

      expect(text).toContain('## User Profile');
      expect(text).toContain('Test user summary');
      expect(text).toContain('## User Attributes');
      // TraitEngine uses templates, so the output is formatted as a sentence
      expect(text).toContain('User has advanced expertise level');
    });

    it('should skip low confidence traits', async () => {
      mockGetProfileById.mockResolvedValue(mockDbProfile);
      mockGetTraitsForProfile.mockResolvedValue([
        {
          id: 'trait-1',
          profileId,
          key: 'low_confidence_trait',
          category: 'context',
          valueType: 'string',
          valueJson: 'should not appear',
          confidence: 0.2, // Below 0.3 threshold
          source: 'extracted',
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const text = await manager.buildInjectionText(profileId);

      expect(text).not.toContain('should not appear');
    });
  });

  describe('storeConversation', () => {
    it('should call bulkCreateMessages with the correct parameters', async () => {
      mockBulkCreateMessages.mockResolvedValue([]);

      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      await manager.storeConversation(profileId, messages, 'req-123');

      expect(mockBulkCreateMessages).toHaveBeenCalledWith(
        profileId,
        messages,
        'req-123'
      );
    });
  });

  describe('updateSummary', () => {
    it('should update profile summary', async () => {
      const updatedProfile = {
        ...mockDbProfile,
        summary: 'New summary',
        summaryVersion: 2,
      };
      mockGetProfileById.mockResolvedValue(mockDbProfile);
      mockUpdateProfile.mockResolvedValue(updatedProfile);

      const result = await manager.updateSummary(profileId, 'New summary');

      expect(mockGetProfileById).toHaveBeenCalledWith(profileId);
      expect(mockUpdateProfile).toHaveBeenCalledWith(profileId, {
        summary: 'New summary',
        summaryVersion: 2,
        summaryUpdatedAt: expect.any(Date),
      });
      expect(result?.summary).toBe('New summary');
    });

    it('should return null if profile not found', async () => {
      mockGetProfileById.mockResolvedValue(null);
      mockUpdateProfile.mockResolvedValue(null);

      const result = await manager.updateSummary(profileId, 'New summary');

      expect(mockUpdateProfile).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('processConversation', () => {
    it('enforces message retention and refreshes summary', async () => {
      vi.useFakeTimers();
      const retentionManager = new ProfileManager({ maxMessagesPerProfile: 1 });
      mockGetProfileById.mockResolvedValue(mockDbProfile);
      mockBulkCreateMessages.mockResolvedValue([
        { id: 'msg-1', role: 'user', content: 'Hello', createdAt: new Date() },
      ]);
      mockGetMessageCount.mockResolvedValue(3);
      mockDeleteOldMessages.mockResolvedValue(2);

      const traitSpy = vi
        .spyOn(retentionManager.getTraitEngine(), 'getTraits')
        .mockResolvedValue([
          {
            id: 'trait-1',
            profileId,
            key: 'name',
            category: 'identity',
            valueType: 'string',
            value: 'Alice',
            confidence: 0.9,
            source: 'extracted',
            sourceMessageIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as never);

      const memorySpy = vi
        .spyOn(retentionManager.getMemoryEngine(), 'getRecentMemories')
        .mockResolvedValue([]);
      const summarySpy = vi
        .spyOn(retentionManager.getMemoryEngine(), 'regenerateSummary')
        .mockResolvedValue('summary');

      await retentionManager.processConversation(profileId, [
        { role: 'user', content: 'Hello' },
      ]);

      await vi.runAllTimersAsync();

      expect(mockDeleteOldMessages).toHaveBeenCalledWith(profileId, 1);
      expect(traitSpy).toHaveBeenCalled();
      expect(memorySpy).toHaveBeenCalled();
      expect(summarySpy).toHaveBeenCalled();
    });
  });

  describe('getRecentMessages', () => {
    it('should return mapped messages', async () => {
      mockGetRecentMessages.mockResolvedValue([
        {
          id: 'msg-1',
          profileId,
          role: 'user',
          content: 'Hello',
          requestId: null,
          model: null,
          processed: false,
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const messages = await manager.getRecentMessages(profileId, 10);

      expect(mockGetRecentMessages).toHaveBeenCalledWith(profileId, 10);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
        createdAt: expect.any(Date),
      });
    });
  });
});
