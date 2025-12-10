import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mocks for DB helpers
const mockListProfiles = vi.fn();
const mockGetProfileByExternalId = vi.fn();
const mockGetAllMemoriesForProfile = vi.fn();
const mockGetAllMessagesForProfile = vi.fn();
const mockGetTraitsForProfile = vi.fn();
const mockGetMemoriesForProfile = vi.fn();
const mockDeleteTraitByKey = vi.fn();
const mockDeleteMemory = vi.fn();
const mockCreateMemory = vi.fn();
const mockUpsertTrait = vi.fn();
const mockCountTraitsForProfile = vi.fn();
const mockCountMemoriesForProfile = vi.fn();
const mockGetMessageCount = vi.fn();
const mockDeleteProfile = vi.fn();
const mockGetOrCreateProfile = vi.fn();

// Mock ProfileManager
const mockTraitEngine = {
  getTraits: vi.fn(),
  getSchema: vi.fn(),
  extractTraits: vi.fn(),
  applyUpdates: vi.fn(),
};
const mockMemoryEngine = {
  getRecentMemories: vi.fn(),
  extractMemoriesFromMessages: vi.fn(),
  storeMemoryCandidates: vi.fn(),
};
const mockProfileManager = {
  getProfile: vi.fn(),
  getOrCreateProfile: mockGetOrCreateProfile,
  getTraitEngine: vi.fn(() => mockTraitEngine),
  getMemoryEngine: vi.fn(() => mockMemoryEngine),
  updateSummary: vi.fn(),
  storeConversation: vi.fn(),
};
const mockGetProfileManager = vi.fn();

vi.mock('@getprofile/db', () => ({
  listProfiles: (...args: unknown[]) => mockListProfiles(...args),
  getProfileByExternalId: (...args: unknown[]) => mockGetProfileByExternalId(...args),
  getAllMemoriesForProfile: (...args: unknown[]) => mockGetAllMemoriesForProfile(...args),
  getAllMessagesForProfile: (...args: unknown[]) => mockGetAllMessagesForProfile(...args),
  getTraitsForProfile: (...args: unknown[]) => mockGetTraitsForProfile(...args),
  getMemoriesForProfile: (...args: unknown[]) => mockGetMemoriesForProfile(...args),
  deleteTraitByKey: (...args: unknown[]) => mockDeleteTraitByKey(...args),
  deleteMemory: (...args: unknown[]) => mockDeleteMemory(...args),
  createMemory: (...args: unknown[]) => mockCreateMemory(...args),
  upsertTrait: (...args: unknown[]) => mockUpsertTrait(...args),
  countTraitsForProfile: (...args: unknown[]) => mockCountTraitsForProfile(...args),
  countMemoriesForProfile: (...args: unknown[]) => mockCountMemoriesForProfile(...args),
  getMessageCount: (...args: unknown[]) => mockGetMessageCount(...args),
  deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
}));

vi.mock('../lib/profile-manager', () => ({
  getProfileManager: () => mockGetProfileManager(),
}));

import profileRoutes from './profiles';

describe('profileRoutes', () => {
  const baseDate = new Date('2024-01-01T00:00:00.000Z');

  const dbProfile = {
    id: 'p1',
    externalId: 'user-123',
    summary: null,
    summaryVersion: 0,
    summaryUpdatedAt: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };

  const trait = {
    id: 't1',
    profileId: 'p1',
    key: 'name',
    category: null,
    valueType: 'string' as const,
    value: 'Alex',
    confidence: 0.9,
    source: 'manual' as const,
    sourceMessageIds: [] as string[],
    createdAt: baseDate,
    updatedAt: baseDate,
  };

  const memory = {
    id: 'm1',
    profileId: 'p1',
    content: 'Prefers async responses',
    type: 'fact' as const,
    importance: 0.6,
    decayFactor: 1,
    sourceMessageIds: [] as string[],
    createdAt: baseDate,
    lastAccessedAt: null,
  };

  const dbTraitRecord = {
    id: 't1',
    profileId: 'p1',
    key: 'name',
    category: null,
    valueType: 'string',
    valueJson: 'Jamie',
    confidence: 0.9,
    source: 'manual',
    sourceMessageIds: [] as string[],
    createdAt: baseDate,
    updatedAt: baseDate,
  };

  const dbMemoryRecord = {
    id: 'm1',
    profileId: 'p1',
    content: 'Prefers async responses',
    type: 'fact',
    importance: 0.6,
    decayFactor: 1,
    sourceMessageIds: [] as string[],
    createdAt: baseDate,
    lastAccessedAt: null,
  };

  const dbMessageRecord = {
    id: 'msg1',
    profileId: 'p1',
    role: 'user',
    content: 'Hello',
    requestId: null,
    model: null,
    processed: false,
    createdAt: baseDate,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockListProfiles.mockResolvedValue({
      profiles: [dbProfile],
      total: 1,
    });

    mockGetProfileByExternalId.mockResolvedValue(null);
    mockGetAllMemoriesForProfile.mockResolvedValue([dbMemoryRecord]);
    mockGetAllMessagesForProfile.mockResolvedValue([dbMessageRecord]);
    mockGetTraitsForProfile.mockResolvedValue([dbTraitRecord]);
    mockGetMemoriesForProfile.mockResolvedValue([dbMemoryRecord]);
    mockDeleteTraitByKey.mockResolvedValue(true);
    mockDeleteMemory.mockResolvedValue(true);
    mockCreateMemory.mockResolvedValue(dbMemoryRecord);
    mockUpsertTrait.mockResolvedValue(dbTraitRecord);
    mockCountTraitsForProfile.mockResolvedValue(2);
    mockCountMemoriesForProfile.mockResolvedValue(3);
    mockGetMessageCount.mockResolvedValue(4);
    mockDeleteProfile.mockResolvedValue(true);

    mockTraitEngine.getTraits.mockResolvedValue([trait]);
    mockTraitEngine.getSchema.mockReturnValue({ key: 'name', valueType: 'string', category: null } as never);
    mockMemoryEngine.getRecentMemories.mockResolvedValue([memory]);
    mockMemoryEngine.extractMemoriesFromMessages.mockResolvedValue([]);
    mockMemoryEngine.storeMemoryCandidates.mockResolvedValue(undefined);
    mockProfileManager.getProfile.mockResolvedValue(dbProfile);
    mockGetOrCreateProfile.mockResolvedValue(dbProfile);
    mockProfileManager.updateSummary.mockResolvedValue({
      ...dbProfile,
      summary: 'Updated summary',
      summaryVersion: 1,
      summaryUpdatedAt: baseDate,
    });

    mockGetProfileManager.mockResolvedValue(mockProfileManager);
  });

  function createApp() {
    const app = new Hono();
    app.route('/', profileRoutes);
    return app;
  }

  it('lists profiles with pagination', async () => {
    const app = createApp();
    const res = await app.request('/api/profiles?limit=10&offset=0&search=user');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.profiles[0]).toMatchObject({
      id: 'p1',
      externalId: 'user-123',
      summary: null,
    });
    expect(body.profiles[0].createdAt).toBe(baseDate.toISOString());
  });

  describe('POST /api/profiles', () => {
    it('creates or returns a profile by external ID', async () => {
      const app = createApp();
      const res = await app.request('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ externalId: '  user-123  ' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.profile.id).toBe('p1');
      expect(body.profile.externalId).toBe('user-123');
      expect(mockGetOrCreateProfile).toHaveBeenCalledWith('user-123');
    });

    it('returns 400 for missing externalId', async () => {
      const app = createApp();
      const res = await app.request('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ externalId: '' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_external_id');
    });
  });

  it('returns profile detail with traits and memories', async () => {
    const app = createApp();
    const res = await app.request('/api/profiles/p1');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.id).toBe('p1');
    expect(body.traits[0]).toMatchObject({ key: 'name', value: 'Alex' });
    expect(body.recentMemories[0]).toMatchObject({ content: 'Prefers async responses' });
  });

  it('updates summary', async () => {
    const app = createApp();
    const res = await app.request('/api/profiles/p1', {
      method: 'PATCH',
      body: JSON.stringify({ summary: 'Updated summary' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.summary).toBe('Updated summary');
    expect(mockProfileManager.updateSummary).toHaveBeenCalledWith('p1', 'Updated summary');
  });

  it('exports profile data', async () => {
    const app = createApp();
    const res = await app.request('/api/profiles/p1/export');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traits).toHaveLength(1);
    expect(body.memories[0].createdAt).toBe(baseDate.toISOString());
    expect(body.messages[0].createdAt).toBe(baseDate.toISOString());
  });

  it('upserts a trait with schema value type', async () => {
    const app = createApp();
    const res = await app.request('/api/profiles/p1/traits/name', {
      method: 'PUT',
      body: JSON.stringify({ value: 'Jamie', confidence: 0.8 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trait.value).toBe('Jamie'); // value comes from mockUpsertTrait return
    expect(mockUpsertTrait).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'p1',
        key: 'name',
        valueJson: 'Jamie',
        valueType: 'string',
        confidence: 0.8,
      })
    );
  });

  it('rejects memory creation with invalid type', async () => {
    const app = createApp();
    const res = await app.request('/api/profiles/p1/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello', type: 'unknown' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_memory_type');
  });

  describe('POST /api/profiles/:id/ingest', () => {
    it('ingests data and extracts traits and memories', async () => {
      // Mock trait extraction
      mockTraitEngine.getTraits.mockResolvedValue([]);
      mockTraitEngine.extractTraits.mockResolvedValue([
        {
          key: 'name',
          value: 'Alex',
          confidence: 0.9,
          action: 'create',
        },
        {
          key: 'interests',
          value: ['TypeScript', 'AI'],
          confidence: 0.8,
          action: 'update',
        },
      ]);
      mockTraitEngine.applyUpdates.mockResolvedValue(undefined);

      // Mock memory extraction
      mockMemoryEngine.extractMemoriesFromMessages.mockResolvedValue([
        { content: 'User prefers technical communication', type: 'preference', importance: 0.7 },
        { content: 'User works at a startup', type: 'fact', importance: 0.8 },
      ]);
      mockMemoryEngine.getRecentMemories.mockResolvedValue([
        { ...memory, content: 'User prefers technical communication' },
        { ...memory, content: 'User works at a startup' },
      ]);

      const app = createApp();
      const res = await app.request('/api/profiles/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({
          data: 'My name is Alex. I love TypeScript and AI. I work at a startup and prefer technical communication.',
          source: 'crm',
          metadata: { importedFrom: 'salesforce' },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.profile.id).toBe('p1');
      expect(body.extracted.traits).toHaveLength(2);
      expect(body.extracted.traits[0]).toMatchObject({
        key: 'name',
        value: 'Alex',
        confidence: 0.9,
        action: 'create',
      });
      expect(body.extracted.memories).toHaveLength(2);
      expect(body.extracted.stats).toMatchObject({
        traitsCreated: 1,
        traitsUpdated: 1,
        memoriesCreated: 2,
      });
      expect(body.source).toBe('crm');
      expect(body.metadata).toMatchObject({ importedFrom: 'salesforce' });

      // Verify the methods were called
      expect(mockTraitEngine.extractTraits).toHaveBeenCalled();
      expect(mockTraitEngine.applyUpdates).toHaveBeenCalled();
      expect(mockProfileManager.storeConversation).toHaveBeenCalled();
      expect(mockMemoryEngine.extractMemoriesFromMessages).toHaveBeenCalled();
    });

    it('rejects empty data', async () => {
      const app = createApp();
      const res = await app.request('/api/profiles/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({ data: '' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_data');
    });

    it('rejects data exceeding size limit', async () => {
      const app = createApp();
      const largeData = 'a'.repeat(101 * 1024); // 101KB
      const res = await app.request('/api/profiles/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({ data: largeData }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('data_too_large');
    });

    it('respects extractTraits and extractMemories flags', async () => {
      mockTraitEngine.extractTraits.mockResolvedValue([]);
      mockMemoryEngine.extractMemoriesFromMessages.mockResolvedValue([]);

      const app = createApp();
      const res = await app.request('/api/profiles/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({
          data: 'Some text',
          extractTraits: false,
          extractMemories: false,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.extracted.stats).toMatchObject({
        traitsCreated: 0,
        traitsUpdated: 0,
        memoriesCreated: 0,
      });

      // Verify extraction methods were not called
      expect(mockTraitEngine.extractTraits).not.toHaveBeenCalled();
      expect(mockMemoryEngine.extractMemoriesFromMessages).not.toHaveBeenCalled();
    });

    it('returns 404 for non-existent profile', async () => {
      mockProfileManager.getProfile.mockResolvedValue(null);

      const app = createApp();
      const res = await app.request('/api/profiles/nonexistent/ingest', {
        method: 'POST',
        body: JSON.stringify({ data: 'Some text' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('profile_not_found');
    });

    it('validates source field type', async () => {
      const app = createApp();
      const res = await app.request('/api/profiles/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({ data: 'Some text', source: 123 }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_source');
    });

    it('validates metadata field type', async () => {
      const app = createApp();
      const res = await app.request('/api/profiles/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({ data: 'Some text', metadata: 'invalid' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_metadata');
    });
  });
});
