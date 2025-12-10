import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpstreamClient, UpstreamError, createUpstreamClient } from './upstream';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UpstreamClient', () => {
  let client: UpstreamClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createUpstreamClient({
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'test-key',
    });
  });

  describe('createChatCompletion', () => {
    it('should make a POST request to the chat completions endpoint', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.createChatCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: expect.stringContaining('"model":"gpt-4"'),
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw UpstreamError on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      await expect(
        client.createChatCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(UpstreamError);
    });

    it('should force stream: false for non-streaming requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      await client.createChatCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true, // Should be overridden to false
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.stream).toBe(false);
    });
  });

  describe('createChatCompletionStream', () => {
    it('should stream chunks from the response', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n'));
          controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":" World"}}]}\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks: unknown[] = [];
      for await (const chunk of client.createChatCompletionStream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toMatchObject({
        id: '1',
        choices: [{ delta: { content: 'Hello' } }],
      });
      expect(chunks[1]).toMatchObject({
        id: '1',
        choices: [{ delta: { content: ' World' } }],
      });
    });

    it('should process the last incomplete line when stream ends without newline', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"First"}}]}\n'));
          // Last line without newline - this should still be processed
          controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"Last"}}]}'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks: unknown[] = [];
      for await (const chunk of client.createChatCompletionStream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toMatchObject({
        id: '1',
        choices: [{ delta: { content: 'First' } }],
      });
      expect(chunks[1]).toMatchObject({
        id: '1',
        choices: [{ delta: { content: 'Last' } }],
      });
    });

    it('should handle multi-byte UTF-8 characters correctly', async () => {
      const encoder = new TextEncoder();
      // Test with emoji that spans multiple bytes
      const emojiData = 'data: {"id":"1","choices":[{"delta":{"content":"Hello 👋"}}]}\n';
      const stream = new ReadableStream({
        start(controller) {
          // Split the emoji across chunks to test UTF-8 sequence handling
          const bytes = encoder.encode(emojiData);
          const midPoint = Math.floor(bytes.length / 2);
          controller.enqueue(bytes.slice(0, midPoint));
          controller.enqueue(bytes.slice(midPoint));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks: unknown[] = [];
      for await (const chunk of client.createChatCompletionStream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        id: '1',
        choices: [{ delta: { content: 'Hello 👋' } }],
      });
    });

    it('should skip malformed JSON lines', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"Valid"}}]}\n'));
          controller.enqueue(encoder.encode('data: {invalid json}\n'));
          controller.enqueue(encoder.encode('data: {"id":"2","choices":[{"delta":{"content":"Also valid"}}]}\n'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks: unknown[] = [];
      for await (const chunk of client.createChatCompletionStream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
    });

    it('should throw UpstreamError on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      await expect(
        (async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of client.createChatCompletionStream({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hi' }],
          })) {
            // Consume stream
          }
        })()
      ).rejects.toThrow(UpstreamError);
    });
  });

  describe('listModels', () => {
    it('should make a GET request to the models endpoint', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4', object: 'model' },
          { id: 'gpt-3.5-turbo', object: 'model' },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.listModels();

      expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/v1/models', {
        headers: {
          Authorization: 'Bearer test-key',
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });
  });
});

describe('UpstreamError', () => {
  it('should contain status and body', () => {
    const error = new UpstreamError('Test error', 500, 'Error body');

    expect(error.message).toBe('Test error');
    expect(error.status).toBe(500);
    expect(error.body).toBe('Error body');
    expect(error.name).toBe('UpstreamError');
  });
});

