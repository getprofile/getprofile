// Tests for chat upstream client helpers

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'hono';
import { getUpstreamClientForRequest } from './chat-upstream';
import * as upstream from '../lib/upstream';

vi.mock('../lib/upstream');

describe('Chat Upstream Helpers', () => {
  const mockUpstreamClient = {
    createChatCompletion: vi.fn(),
    createChatCompletionStream: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upstream.getUpstreamClient).mockReturnValue(mockUpstreamClient as unknown as ReturnType<typeof upstream.getUpstreamClient>);
    vi.mocked(upstream.createUpstreamClient).mockReturnValue(mockUpstreamClient as unknown as ReturnType<typeof upstream.createUpstreamClient>);
  });

  it('should use default upstream client when no headers provided', async () => {
    const mockContext = {
      req: {
        header: vi.fn(() => undefined),
      },
    } as unknown as Context;

    const client = await getUpstreamClientForRequest(mockContext);
    expect(client).toBe(mockUpstreamClient);
    expect(upstream.getUpstreamClient).toHaveBeenCalled();
    expect(upstream.createUpstreamClient).not.toHaveBeenCalled();
  });

  it('should create custom client when upstream provider header provided', async () => {
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-upstream-provider') return 'anthropic';
          return undefined;
        }),
      },
    } as unknown as Context;

    await getUpstreamClientForRequest(mockContext);
    expect(upstream.createUpstreamClient).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
      })
    );
  });

  it('should create custom client when upstream key header provided', async () => {
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-upstream-key') return 'custom-key';
          return undefined;
        }),
      },
    } as unknown as Context;

    await getUpstreamClientForRequest(mockContext);
    expect(upstream.createUpstreamClient).toHaveBeenCalled();
  });

  it('should create custom client when upstream base URL header provided', async () => {
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-upstream-base-url') return 'https://custom.api.com';
          return undefined;
        }),
      },
    } as unknown as Context;

    await getUpstreamClientForRequest(mockContext);
    expect(upstream.createUpstreamClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://custom.api.com',
      })
    );
  });
});
