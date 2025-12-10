// Integration tests for chat completion endpoint
// Tests the full flow including profile creation and context injection

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import chatRoutes from '../routes/chat';
import * as profileManager from '../lib/profile-manager';
import * as chatUpstream from '../routes/chat-upstream';

// Mock dependencies
vi.mock('../lib/profile-manager');
vi.mock('../routes/chat-upstream');

describe('Chat Completion Integration', () => {
  let app: Hono;
  const mockProfileManager = {
    getOrCreateProfile: vi.fn(),
    buildInjectionText: vi.fn(),
    processConversation: vi.fn(),
  };
  const mockUpstreamClient = {
    createChatCompletion: vi.fn(),
    createChatCompletionStream: vi.fn(),
  };

  beforeEach(() => {
    process.env.GETPROFILE_API_KEY = '';
    app = new Hono();
    app.route('/', chatRoutes);

    vi.mocked(profileManager.getProfileManager).mockResolvedValue(mockProfileManager as unknown as Awaited<ReturnType<typeof profileManager.getProfileManager>>);
    vi.mocked(chatUpstream.getUpstreamClientForRequest).mockResolvedValue(mockUpstreamClient as unknown as Awaited<ReturnType<typeof chatUpstream.getUpstreamClientForRequest>>);

    // Setup default mocks
    mockProfileManager.getOrCreateProfile.mockResolvedValue({
      id: 'profile-123',
      externalId: 'user-456',
      summary: 'Test user profile',
      summaryVersion: 1,
      summaryUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockProfileManager.buildInjectionText.mockResolvedValue('## User Profile\nTest user profile');
    mockUpstreamClient.createChatCompletion.mockResolvedValue({
      id: 'chat-123',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello! How can I help you?',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GETPROFILE_API_KEY;
  });

  describe('Full Request Flow', () => {
    it('should complete full chat completion flow', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'What is TypeScript?' },
          ],
        }),
      });

      expect(res.status).toBe(200);
      
      // Verify profile was created/retrieved
      expect(mockProfileManager.getOrCreateProfile).toHaveBeenCalledWith('user-123');
      
      // Verify context was built
      expect(mockProfileManager.buildInjectionText).toHaveBeenCalled();
      
      // Verify upstream was called
      expect(mockUpstreamClient.createChatCompletion).toHaveBeenCalled();
      
      // Verify response
      const body = await res.json();
      expect(body.id).toBe('chat-123');
      expect(body.choices).toHaveLength(1);
    });

    it('should inject profile context into system message', async () => {
      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
          ],
        }),
      });

      const callArgs = mockUpstreamClient.createChatCompletion.mock.calls[0]?.[0];
      const messages = callArgs?.messages as Array<{ role: string; content: string }>;
      
      // Should have system message with injection
      const systemMessage = messages?.find(m => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toContain('User Profile');
    });

    it('should append to existing system message', async () => {
      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      });

      const callArgs = mockUpstreamClient.createChatCompletion.mock.calls[0]?.[0];
      const messages = callArgs?.messages as Array<{ role: string; content: string }>;
      
      // Should have only one system message with both original and injection
      const systemMessages = messages?.filter(m => m.role === 'system');
      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0]?.content).toContain('You are a helpful assistant.');
      expect(systemMessages[0]?.content).toContain('User Profile');
    });
  });

  describe('Background Processing', () => {
    it('should process conversation in background after response', async () => {
      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
          ],
        }),
      });

      // Wait for background processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify conversation was processed
      expect(mockProfileManager.processConversation).toHaveBeenCalled();
      const processCall = mockProfileManager.processConversation.mock.calls[0];
      expect(processCall?.[0]).toBe('profile-123'); // profileId
      expect(processCall?.[1]).toHaveLength(2); // user + assistant messages
    });
  });
});
