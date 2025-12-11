import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileSummarizer } from './summarizer';

// Mock fetch globally
global.fetch = vi.fn();

// Mock the @getprofile/db module
vi.mock('@getprofile/db', () => ({
  getProfileById: vi.fn(),
  updateProfile: vi.fn(),
}));

import { getProfileById, updateProfile } from '@getprofile/db';

const mockGetProfileById = vi.mocked(getProfileById);
const mockUpdateProfile = vi.mocked(updateProfile);

type DbProfile = NonNullable<Awaited<ReturnType<typeof getProfileById>>>;

const createProfileRecord = (overrides: Partial<DbProfile> = {}): DbProfile => ({
  id: 'profile-123',
  externalId: 'user-123',
  summary: null,
  summaryVersion: 0,
  summaryUpdatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ProfileSummarizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const summarizer = new ProfileSummarizer();
      expect(summarizer).toBeInstanceOf(ProfileSummarizer);
    });

    it('should create with custom config', () => {
      const summarizer = new ProfileSummarizer({
        llm: { apiKey: 'test-key', model: 'gpt-4' },
        summarizationInterval: 120,
      });
      expect(summarizer).toBeInstanceOf(ProfileSummarizer);
    });
  });

  describe('getSummary', () => {
    it('should return cached summary if fresh', async () => {
      const summarizer = new ProfileSummarizer({ summarizationInterval: 60 });
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

      const summary = await summarizer.getSummary(profileId, traits, memories);

      expect(summary).toBe('Cached summary');
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('should regenerate if summary is stale', async () => {
      // Save and clear environment variables to ensure no API key is used
      const savedLLMKey = process.env.LLM_API_KEY;
      const savedOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const summarizer = new ProfileSummarizer({ summarizationInterval: 1 });
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
          summaryVersion: 2,
          summaryUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const summary = await summarizer.getSummary(profileId, traits, memories);

        expect(summary).toContain('Bob');
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          profileId,
          expect.objectContaining({
            summary: expect.any(String),
            summaryVersion: 2,
          })
        );
      } finally {
        // Restore environment variables
        if (savedLLMKey) process.env.LLM_API_KEY = savedLLMKey;
        if (savedOpenAIKey) process.env.OPENAI_API_KEY = savedOpenAIKey;
      }
    });

    it('should regenerate if no summary exists', async () => {
      // Save and clear environment variables to ensure no API key is used
      const savedLLMKey = process.env.LLM_API_KEY;
      const savedOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const summarizer = new ProfileSummarizer();
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

        mockGetProfileById.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: null,
          summaryVersion: 0,
          summaryUpdatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockUpdateProfile.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: 'This is Charlie.',
          summaryVersion: 1,
          summaryUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const summary = await summarizer.getSummary(profileId, traits, memories);

        expect(summary).toContain('Charlie');
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          profileId,
          expect.objectContaining({ summaryVersion: 1 })
        );
      } finally {
        // Restore environment variables
        if (savedLLMKey) process.env.LLM_API_KEY = savedLLMKey;
        if (savedOpenAIKey) process.env.OPENAI_API_KEY = savedOpenAIKey;
      }
    });

    it('should return empty string if profile not found', async () => {
      const summarizer = new ProfileSummarizer();
      const profileId = 'profile-123';

      mockGetProfileById.mockResolvedValue(null);

      const summary = await summarizer.getSummary(profileId, [], []);

      expect(summary).toBe('');
    });
  });

  describe('regenerate', () => {
    it('should generate basic summary without API key', async () => {
      // Save and clear environment variables to ensure no API key is used
      const savedLLMKey = process.env.LLM_API_KEY;
      const savedOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const summarizer = new ProfileSummarizer();
        const profileId = 'profile-123';
        const traits = [
          {
            id: 'trait-1',
            profileId,
            key: 'name',
            category: 'identity',
            valueType: 'string' as const,
            value: 'David',
            confidence: 0.9,
            source: 'extracted' as const,
            sourceMessageIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'trait-2',
            profileId,
            key: 'communication_style',
            category: 'communication',
            valueType: 'string' as const,
            value: 'formal',
            confidence: 0.8,
            source: 'extracted' as const,
            sourceMessageIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
        const memories: never[] = [];

        mockGetProfileById.mockResolvedValue(
          createProfileRecord({
            id: profileId,
            summaryVersion: 0,
          })
        );

        mockUpdateProfile.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: 'This is David. Prefers formal communication.',
          summaryVersion: 1,
          summaryUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const summary = await summarizer.regenerate(profileId, traits, memories);

        expect(summary).toContain('David');
        expect(summary).toContain('formal');
        expect(mockUpdateProfile).toHaveBeenCalled();
      } finally {
        // Restore environment variables
        if (savedLLMKey) process.env.LLM_API_KEY = savedLLMKey;
        if (savedOpenAIKey) process.env.OPENAI_API_KEY = savedOpenAIKey;
      }
    });

    it('should generate basic summary with all trait types', async () => {
      const summarizer = new ProfileSummarizer();
      const profileId = 'profile-123';
      const traits = [
        {
          id: 'trait-1',
          profileId,
          key: 'name',
          category: 'identity',
          valueType: 'string' as const,
          value: 'Eve',
          confidence: 0.9,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'trait-2',
          profileId,
          key: 'communication_style',
          category: 'communication',
          valueType: 'string' as const,
          value: 'casual',
          confidence: 0.8,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'trait-3',
          profileId,
          key: 'expertise_level',
          category: 'context',
          valueType: 'string' as const,
          value: 'expert',
          confidence: 0.7,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'trait-4',
          profileId,
          key: 'interests',
          category: 'preferences',
          valueType: 'array' as const,
          value: ['AI', 'TypeScript', 'Open Source'],
          confidence: 0.6,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const memories: never[] = [];

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 0,
        })
      );

      mockUpdateProfile.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'Generated summary',
        summaryVersion: 1,
        summaryUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await summarizer.regenerate(profileId, traits, memories);

      expect(summary).toContain('Eve');
      expect(summary).toContain('casual');
      expect(summary).toContain('expert');
      expect(summary).toContain('AI');
    });

    it('should generate basic summary for new user with no traits', async () => {
      // Save and clear environment variables to ensure no API key is used
      const savedLLMKey = process.env.LLM_API_KEY;
      const savedOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const summarizer = new ProfileSummarizer();
        const profileId = 'profile-123';
        const traits: never[] = [];
        const memories: never[] = [];

        mockGetProfileById.mockResolvedValue(
          createProfileRecord({
            id: profileId,
            summaryVersion: 0,
          })
        );

        mockUpdateProfile.mockResolvedValue({
          id: profileId,
          externalId: 'user-123',
          summary: 'New user profile',
          summaryVersion: 1,
          summaryUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const summary = await summarizer.regenerate(profileId, traits, memories);

        expect(summary).toBe('New user profile');
        expect(mockUpdateProfile).toHaveBeenCalled();
      } finally {
        // Restore environment variables
        if (savedLLMKey) process.env.LLM_API_KEY = savedLLMKey;
        if (savedOpenAIKey) process.env.OPENAI_API_KEY = savedOpenAIKey;
      }
    });

    it('should call LLM when API key is provided', async () => {
      const summarizer = new ProfileSummarizer({
        llm: { apiKey: 'test-key' },
      });
      const profileId = 'profile-123';
      const traits = [
        {
          id: 'trait-1',
          profileId,
          key: 'name',
          category: 'identity',
          valueType: 'string' as const,
          value: 'Frank',
          confidence: 0.9,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const memories = [
        {
          id: 'mem-1',
          profileId,
          content: 'User works at a startup',
          type: 'fact' as const,
          importance: 0.8,
          decayFactor: 1.0,
          sourceMessageIds: [],
          createdAt: new Date(),
          lastAccessedAt: null,
        },
      ];

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 3,
        })
      );

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Frank is a professional working at a startup.',
              },
            },
          ],
        }),
      } as Response);

      mockUpdateProfile.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'Frank is a professional working at a startup.',
        summaryVersion: 4,
        summaryUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await summarizer.regenerate(profileId, traits, memories);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
          signal: expect.any(AbortSignal),
        })
      );
      expect(summary).toBe('Frank is a professional working at a startup.');
    });

    it('should use custom model and baseUrl', async () => {
      const summarizer = new ProfileSummarizer({
        llm: {
          apiKey: 'test-key',
          model: 'gpt-4',
          baseUrl: 'https://custom.api.com/v1',
        },
      });
      const profileId = 'profile-123';
      const traits: never[] = [];
      const memories: never[] = [];

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 1,
        })
      );

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Custom summary' } }],
        }),
      } as Response);

      mockUpdateProfile.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'Custom summary',
        summaryVersion: 2,
        summaryUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await summarizer.regenerate(profileId, traits, memories);

      expect(fetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"model":"gpt-4"'),
        })
      );
    });

    it('should fall back to basic summary on LLM error', async () => {
      const summarizer = new ProfileSummarizer({
        llm: { apiKey: 'test-key' },
      });
      const profileId = 'profile-123';
      const traits = [
        {
          id: 'trait-1',
          profileId,
          key: 'name',
          category: 'identity',
          valueType: 'string' as const,
          value: 'Grace',
          confidence: 0.9,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const memories: never[] = [];

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 2,
        })
      );

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as Response);

      const summary = await summarizer.regenerate(profileId, traits, memories);

      // When LLM fails, it returns basic summary but doesn't update the profile
      expect(summary).toContain('Grace');
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('should filter traits by confidence threshold in prompt', async () => {
      const summarizer = new ProfileSummarizer({
        llm: { apiKey: 'test-key' },
      });
      const profileId = 'profile-123';
      const traits = [
        {
          id: 'trait-1',
          profileId,
          key: 'high_confidence',
          category: 'identity',
          valueType: 'string' as const,
          value: 'value1',
          confidence: 0.9,
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'trait-2',
          profileId,
          key: 'low_confidence',
          category: 'identity',
          valueType: 'string' as const,
          value: 'value2',
          confidence: 0.3, // Below 0.5 threshold
          source: 'extracted' as const,
          sourceMessageIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const memories: never[] = [];

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 0,
        })
      );

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Summary' } }],
        }),
      } as Response);

      mockUpdateProfile.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'Summary',
        summaryVersion: 1,
        summaryUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await summarizer.regenerate(profileId, traits, memories);

      // Check that the prompt only includes high confidence traits
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      const prompt = body.messages[1].content;

      expect(prompt).toContain('high_confidence');
      expect(prompt).not.toContain('low_confidence');
    });

    it('should include top 10 memories sorted by importance', async () => {
      const summarizer = new ProfileSummarizer({
        llm: { apiKey: 'test-key' },
      });
      const profileId = 'profile-123';
      const traits: never[] = [];
      const memories = Array.from({ length: 15 }, (_, i) => ({
        id: `mem-${i}`,
        profileId,
        content: `Memory ${i}`,
        type: 'fact' as const,
        importance: (15 - i) / 15, // Higher importance for lower index
        decayFactor: 1.0,
        sourceMessageIds: [],
        createdAt: new Date(),
        lastAccessedAt: null,
      }));

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 0,
        })
      );

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Summary' } }],
        }),
      } as Response);

      mockUpdateProfile.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'Summary',
        summaryVersion: 1,
        summaryUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await summarizer.regenerate(profileId, traits, memories);

      // Check that only top 10 are included
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      const prompt = body.messages[1].content;

      expect(prompt).toContain('Memory 0');
      expect(prompt).toContain('Memory 9');
      expect(prompt).not.toContain('Memory 10');
    });

    it('should increment summary version using stored profile value', async () => {
      const summarizer = new ProfileSummarizer();
      const profileId = 'profile-123';
      const traits: never[] = [];
      const memories: never[] = [];

      mockGetProfileById.mockResolvedValue(
        createProfileRecord({
          id: profileId,
          summaryVersion: 5,
        })
      );

      mockUpdateProfile.mockResolvedValue({
        id: profileId,
        externalId: 'user-123',
        summary: 'New user profile',
        summaryVersion: 6,
        summaryUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DbProfile);

      await summarizer.regenerate(profileId, traits, memories);

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        profileId,
        expect.objectContaining({ summaryVersion: 6 })
      );
    });

    it('should abort LLM request after configured timeout', async () => {
      vi.useFakeTimers();
      const summarizer = new ProfileSummarizer({
        llm: { apiKey: 'test-key', timeoutMs: 10 },
      });
      const profileId = 'profile-123';
      const traits: never[] = [];
      const memories: never[] = [];

      vi.mocked(fetch).mockImplementation((_, options?: RequestInit) => {
        const signal = options?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }) as Promise<Response>;
      });

      const summaryPromise = summarizer.regenerate(profileId, traits, memories);

      await vi.advanceTimersByTimeAsync(20);

      await expect(summaryPromise).resolves.toBe('New user profile');
      expect(mockUpdateProfile).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
