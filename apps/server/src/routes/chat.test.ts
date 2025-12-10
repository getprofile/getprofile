// Comprehensive tests for chat completion endpoint

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import chatRoutes from './chat';
import * as profileManager from '../lib/profile-manager';
import * as chatUpstream from './chat-upstream';

// Mock dependencies
vi.mock('../lib/profile-manager');
vi.mock('./chat-upstream');

describe('Chat Completion Endpoint', () => {
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
    // Don't require auth for tests
    process.env.GETPROFILE_API_KEY = '';
    process.env.GETPROFILE_RATE_LIMIT = '0'; // Disable rate limiting for tests
    
    app = new Hono();
    // Add routes without middleware for testing
    app.route('/', chatRoutes);

    vi.mocked(profileManager.getProfileManager).mockResolvedValue(mockProfileManager as unknown as Awaited<ReturnType<typeof profileManager.getProfileManager>>);
    vi.mocked(chatUpstream.getUpstreamClientForRequest).mockResolvedValue(mockUpstreamClient as unknown as Awaited<ReturnType<typeof chatUpstream.getUpstreamClientForRequest>>);

    // Default mock implementations
    mockProfileManager.getOrCreateProfile.mockResolvedValue({
      id: 'profile-123',
      externalId: 'user-456',
      summary: null,
      summaryVersion: 0,
      summaryUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockProfileManager.buildInjectionText.mockResolvedValue('User profile context');
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
    delete process.env.GETPROFILE_RATE_LIMIT;
  });

  describe('Input Validation', () => {
    it('should reject request without messages', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('missing_messages');
    });

    it('should reject request without model', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('missing_model');
    });

    it('should reject request with too many messages', async () => {
      const messages = Array.from({ length: 101 }, () => ({
        role: 'user' as const,
        content: 'Message',
      }));

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('too_many_messages');
    });

    it('should reject request with message exceeding size limit', async () => {
      const largeContent = 'x'.repeat(101_000); // 101KB

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: largeContent }],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('message_too_large');
    });

    it('should reject request without user ID', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('missing_user_id');
    });

    it('should accept user ID from header', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(200);
      expect(mockProfileManager.getOrCreateProfile).toHaveBeenCalledWith('user-123');
    });

    it('should accept user ID from body.user', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          user: 'user-123',
        }),
      });

      expect(res.status).toBe(200);
      expect(mockProfileManager.getOrCreateProfile).toHaveBeenCalledWith('user-123');
    });
  });

  describe('Non-streaming Responses', () => {
    it('should return chat completion response', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
          'Authorization': 'Bearer test-key', // Mock auth
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('chat-123');
      expect(body.choices).toHaveLength(1);
      expect(body.choices[0]?.message.content).toBe('Hello! How can I help you?');
    });

    it('should inject profile context into messages', async () => {
      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(mockProfileManager.buildInjectionText).toHaveBeenCalled();
      expect(mockUpstreamClient.createChatCompletion).toHaveBeenCalled();
      const callArgs = mockUpstreamClient.createChatCompletion.mock.calls[0]?.[0] as { messages?: Array<{ role: string; content: string }> };
      expect(callArgs?.messages).toBeDefined();
      // Should have system message with injection
      const systemMessage = callArgs?.messages?.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
    });

    it('should process conversation in background', async () => {
      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      // Wait for background processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockProfileManager.processConversation).toHaveBeenCalled();
    });
  });

  describe('Streaming Responses', () => {
    it('should handle streaming requests', async () => {
      const chunks: Array<{
        id: string;
        object: string;
        created: number;
        model: string;
        choices: Array<{
          index: number;
          delta: { content: string };
          finish_reason: string | null;
        }>;
      }> = [
        {
          id: 'chat-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null,
          }],
        },
        {
          id: 'chat-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: ' world' },
            finish_reason: 'stop',
          }],
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      mockUpstreamClient.createChatCompletionStream.mockReturnValue(mockStream());

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
    });
  });

  describe('Error Handling', () => {
    it('should handle upstream errors', async () => {
      const upstreamError = new Error('Upstream service unavailable');
      upstreamError.name = 'UpstreamError';
      (upstreamError as { status?: number }).status = 503;
      mockUpstreamClient.createChatCompletion.mockRejectedValue(upstreamError);

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.type).toBe('upstream_error');
    });

    it('should handle profile manager errors', async () => {
      mockProfileManager.getOrCreateProfile.mockRejectedValue(new Error('Database error'));

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.type).toBe('internal_error');
    });
  });

  describe('Message Content Types', () => {
    it('should handle string content', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Simple text message' }],
        }),
      });

      expect(res.status).toBe(200);
    });

    it('should handle array content with text parts', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GetProfile-Id': 'user-123',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: 'World' },
            ],
          }],
        }),
      });

      expect(res.status).toBe(200);
    });
  });
});
