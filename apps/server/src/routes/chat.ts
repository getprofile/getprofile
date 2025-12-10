// /v1/chat/completions endpoint
// OpenAI-compatible chat completion with profile injection

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  type ChatMessage,
  type StreamChunk,
} from '../lib/upstream';
import { getProfileManager } from '../lib/profile-manager';
import { sendError, handleError } from '../lib/errors';
import { getUpstreamClientForRequest } from './chat-upstream';
import { createLogger } from '@getprofile/core';
import { validateGetProfileOptions, type GetProfileRequestOptions } from '../types/request-options';

const logger = createLogger({ name: 'chat-route' });

const chat = new Hono();

// Import validation helpers
import { validateMessageCount, validateMessages } from './chat-validation';

/**
 * Extract the external user ID from the request.
 * This is YOUR app's user identifier, not the internal GetProfile UUID.
 */
function extractExternalId(
  c: { req: { header: (name: string) => string | undefined } },
  body: { user?: string; metadata?: { profile_id?: string } }
): string | null {
  // Check header first (recommended)
  const headerId = c.req.header('x-getprofile-id');
  if (headerId) return headerId;

  // Check OpenAI metadata extension
  if (body.metadata?.profile_id) return body.metadata.profile_id;

  // Check standard OpenAI user field
  if (body.user) return body.user;

  return null;
}

/**
 * Inject profile context into messages.
 */
export function isValidMessageContent(content: unknown): content is ChatMessage['content'] {
  if (typeof content === 'string') {
    return true;
  }
  if (Array.isArray(content)) {
    return content.every(
      (part) => part && typeof part === 'object' && typeof (part as { type?: unknown }).type === 'string'
    );
  }
  return false;
}

export function extractTextFromContent(content: ChatMessage['content'] | undefined): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return String((part as { text: string }).text);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function appendInjectionToContent(
  current: ChatMessage['content'],
  injectionText: string
): ChatMessage['content'] {
  if (typeof current === 'string') {
    return `${current}\n\n---\n\n${injectionText}`;
  }
  return [
    ...current,
    {
      type: 'text',
      text: `\n\n---\n\n${injectionText}`,
    },
  ];
}

function normalizeForProcessing(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: extractTextFromContent(msg.content),
  }));
}

function injectContext(messages: ChatMessage[], injectionText: string): ChatMessage[] {
  if (!injectionText) return messages;

  // Find existing system message
  const systemIndex = messages.findIndex((m) => m.role === 'system');

  if (systemIndex >= 0) {
    // Append to existing system message
    const updated = [...messages];
    const current = messages[systemIndex]!;
    updated[systemIndex] = {
      ...current,
      role: 'system',
      content: appendInjectionToContent(current.content, injectionText),
    };
    return updated;
  } else {
    // Prepend new system message
    return [{ role: 'system', content: injectionText }, ...messages];
  }
}

/**
 * Collect content from stream chunks.
 */
function collectStreamContent(chunks: StreamChunk[]): string {
  return chunks
    .map((c) => extractTextFromContent(c.choices[0]?.delta?.content))
    .filter(Boolean)
    .join('');
}

chat.post('/v1/chat/completions', async (c) => {
  try {
    const body = await c.req.json();
    const { messages, model, stream, getprofile: getprofileOptions, ...rest } = body;

    // Parse and validate GetProfile options
    let validatedOptions: GetProfileRequestOptions | null = null;
    if (getprofileOptions) {
      validatedOptions = validateGetProfileOptions(getprofileOptions);
      if (validatedOptions === null) {
        return sendError(
          c,
          400,
          'Invalid getprofile options format',
          'invalid_request_error',
          'invalid_getprofile_options'
        );
      }
    }

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      return sendError(c, 400, 'messages is required and must be an array', 'invalid_request_error', 'missing_messages');
    }

    // Validate message count
    const countValidation = validateMessageCount(messages, c, sendError);
    if (!countValidation.valid) {
      return countValidation.response;
    }

    // Validate message structure and size
    const messageValidation = validateMessages(messages, c, sendError);
    if (!messageValidation.valid) {
      return messageValidation.response;
    }
    const chatMessages = messageValidation.chatMessages;

    if (!model) {
      return sendError(c, 400, 'model is required', 'invalid_request_error', 'missing_model');
    }

    // Extract external user ID
    const externalId = extractExternalId(c, body);
    if (!externalId) {
      return sendError(
        c,
        400,
        'User ID required (X-GetProfile-Id header, body.user, or body.metadata.profile_id)',
        'invalid_request_error',
        'missing_user_id'
      );
    }

    // Get or create profile
    const pm = await getProfileManager();
    const profile = await pm.getOrCreateProfile(externalId);

    // Build injection context (unless skipInjection is true)
    let enrichedMessages = chatMessages;
    if (!validatedOptions?.skipInjection) {
      const userQuery =
        extractTextFromContent(chatMessages.find((m: ChatMessage) => m.role === 'user')?.content) || '';
      const injectionText = await pm.buildInjectionText(
        profile.id,
        userQuery,
        validatedOptions?.traits
      );

      // Inject context into messages
      enrichedMessages = injectContext(chatMessages, injectionText);
    }

    // Get upstream client with optional per-request overrides
    const upstream = await getUpstreamClientForRequest(c);

    // Build upstream request (strip getprofile extension)
    const upstreamRequest = {
      ...rest,
      model,
      messages: enrichedMessages,
    };

    if (stream) {
      // Streaming response
      return streamSSE(c, async (sseStream) => {
        const chunks: StreamChunk[] = [];

        try {
          for await (const chunk of upstream.createChatCompletionStream(upstreamRequest)) {
            chunks.push(chunk);
            await sseStream.writeSSE({ data: JSON.stringify(chunk) });
          }

          // Send [DONE] marker
          await sseStream.writeSSE({ data: '[DONE]' });

          // Process conversation in background (store messages + extract traits)
          const assistantContent = collectStreamContent(chunks);
          if (assistantContent && !validatedOptions?.skipExtraction) {
            setImmediate(async () => {
              try {
                const assistantMessage: ChatMessage = {
                  role: 'assistant',
                  content: assistantContent,
                };
                const fullMessages: ChatMessage[] = [...chatMessages, assistantMessage];
                await pm.processConversation(profile.id, normalizeForProcessing(fullMessages), {
                  skipExtraction: validatedOptions?.skipExtraction,
                  customTraitSchemas: validatedOptions?.traits,
                });
              } catch (error) {
                logger.error(
                  { err: error, profileId: profile.id },
                  'Background processing failed for profile'
                );
              }
            });
          }
        } catch (error) {
          logger.error({ err: error, profileId: profile.id }, 'Streaming error');
          await sseStream.writeSSE({
            data: JSON.stringify({
              error: {
                message: error instanceof Error ? error.message : 'Upstream error',
                type: 'upstream_error',
              },
            }),
          });
        }
      });
    } else {
      // Non-streaming response
      const response = await upstream.createChatCompletion(upstreamRequest);

      // Process conversation in background (store messages + extract traits)
      const firstChoice = response.choices?.[0];
      const assistantContent = firstChoice?.message?.content
        ? extractTextFromContent(firstChoice.message.content)
        : null;
      if (assistantContent && !validatedOptions?.skipExtraction) {
        setImmediate(async () => {
          try {
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: assistantContent,
            };
            const fullMessages: ChatMessage[] = [...chatMessages, assistantMessage];
            await pm.processConversation(profile.id, normalizeForProcessing(fullMessages), {
              skipExtraction: validatedOptions?.skipExtraction,
              customTraitSchemas: validatedOptions?.traits,
            });
          } catch (error) {
            logger.error({ err: error, profileId: profile.id }, 'Background processing failed for profile');
          }
        });
      }

      return c.json(response);
    }
  } catch (error) {
    logger.error({ err: error, path: c.req.path }, 'Request error');
    const errorInfo = handleError(error);
    const statusCode: ContentfulStatusCode = (error instanceof Error && error.name === 'UpstreamError' 
      ? (error as unknown as { status: number }).status 
      : 500) as ContentfulStatusCode;
    return sendError(
      c,
      statusCode,
      errorInfo.message,
      errorInfo.type,
      undefined,
      undefined,
      errorInfo.details
    );
  }
});

export default chat;
