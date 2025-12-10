// Validation helpers for chat route
// Extracted to improve testability and maintainability

import type { Context } from 'hono';
import type { ChatMessage } from '../lib/upstream';
import type { sendError } from '../lib/errors';
import { extractTextFromContent, isValidMessageContent } from './chat';

// Input validation constants
export const MAX_MESSAGE_LENGTH = 100_000; // 100KB per message
export const MAX_TOTAL_MESSAGES_SIZE = 1_000_000; // 1MB total
export const MAX_MESSAGES_COUNT = 100; // Maximum number of messages per request

/**
 * Validate message count limit.
 */
export function validateMessageCount(
  messages: unknown[],
  c: Context,
  sendErrorFn: typeof sendError
): { valid: false; response: Response } | { valid: true } {
  if (messages.length > MAX_MESSAGES_COUNT) {
    return {
      valid: false,
      response: sendErrorFn(
        c,
        400,
        `Too many messages. Maximum ${MAX_MESSAGES_COUNT} messages allowed per request`,
        'invalid_request_error',
        'too_many_messages'
      ),
    };
  }
  return { valid: true };
}

/**
 * Validate message structure and size.
 */
export function validateMessages(
  messages: unknown[],
  c: Context,
  sendErrorFn: typeof sendError
): { valid: false; response: Response } | { valid: true; chatMessages: ChatMessage[] } {
  const validRoles = ['system', 'user', 'assistant'];
  let totalSize = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') {
      return {
        valid: false,
        response: sendErrorFn(c, 400, `messages[${i}] must be an object`, 'invalid_request_error', 'invalid_message_format'),
      };
    }
    const msgObj = msg as Record<string, unknown>;
    if (!msgObj.role || typeof msgObj.role !== 'string') {
      return {
        valid: false,
        response: sendErrorFn(c, 400, `messages[${i}].role is required and must be a string`, 'invalid_request_error', 'invalid_message_format'),
      };
    }
    if (!validRoles.includes(msgObj.role)) {
      return {
        valid: false,
        response: sendErrorFn(c, 400, `messages[${i}].role must be one of: ${validRoles.join(', ')}`, 'invalid_request_error', 'invalid_message_format'),
      };
    }
    if (!isValidMessageContent(msgObj.content)) {
      return {
        valid: false,
        response: sendErrorFn(c, 400, `messages[${i}].content is required and must be a string or array of content parts`, 'invalid_request_error', 'invalid_message_format'),
      };
    }

    // Validate message content size
    const contentText = extractTextFromContent(msgObj.content as ChatMessage['content']);
    const messageSize = new Blob([contentText]).size;
    if (messageSize > MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        response: sendErrorFn(
          c,
          400,
          `messages[${i}].content exceeds maximum size of ${MAX_MESSAGE_LENGTH} bytes`,
          'invalid_request_error',
          'message_too_large'
        ),
      };
    }
    totalSize += messageSize;
  }

  // Validate total size
  if (totalSize > MAX_TOTAL_MESSAGES_SIZE) {
    return {
      valid: false,
      response: sendErrorFn(
        c,
        400,
        `Total message size exceeds maximum of ${MAX_TOTAL_MESSAGES_SIZE} bytes`,
        'invalid_request_error',
        'total_size_too_large'
      ),
    };
  }

  return {
    valid: true,
    chatMessages: messages as ChatMessage[],
  };
}
