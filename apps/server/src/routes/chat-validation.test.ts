// Tests for chat validation helpers

import { describe, it, expect, vi } from 'vitest';
import type { Context } from 'hono';
import { validateMessageCount, validateMessages, MAX_MESSAGES_COUNT, MAX_MESSAGE_LENGTH, MAX_TOTAL_MESSAGES_SIZE } from './chat-validation';

describe('Chat Validation', () => {
  const mockContext = {
    req: {
      header: vi.fn(),
    },
  } as unknown as Context;

  const mockSendErrorFn = vi.fn((c: Context, status: number, message: string, type: string, code?: string) => {
    return new Response(JSON.stringify({ error: { message, type, code } }), { status }) as unknown as Response;
  });

  describe('validateMessageCount', () => {
    it('should accept valid message count', () => {
      const messages = Array.from({ length: 50 }, () => ({ role: 'user', content: 'test' }));
      const result = validateMessageCount(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(true);
    });

    it('should reject too many messages', () => {
      const messages = Array.from({ length: MAX_MESSAGES_COUNT + 1 }, () => ({ role: 'user', content: 'test' }));
      const result = validateMessageCount(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.response.status).toBe(400);
      }
    });
  });

  describe('validateMessages', () => {
    it('should accept valid messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const result = validateMessages(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.chatMessages).toHaveLength(2);
      }
    });

    it('should reject invalid message structure', () => {
      const messages = [
        { role: 'invalid', content: 'Hello' },
      ];
      const result = validateMessages(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(false);
    });

    it('should reject message exceeding size limit', () => {
      const largeContent = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
      const messages = [
        { role: 'user', content: largeContent },
      ];
      const result = validateMessages(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(false);
    });

    it('should reject messages exceeding total size limit', () => {
      const largeContent = 'x'.repeat(MAX_TOTAL_MESSAGES_SIZE / 2 + 1);
      const messages = [
        { role: 'user', content: largeContent },
        { role: 'user', content: largeContent },
      ];
      const result = validateMessages(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(false);
    });

    it('should accept messages with array content', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
          ],
        },
      ];
      const result = validateMessages(messages, mockContext, mockSendErrorFn);
      expect(result.valid).toBe(true);
    });
  });
});
