/**
 * Copyright (c) 2025 GetProfile
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license text.
 */

// Prompt loading utilities
// Loads prompt templates from markdown files

import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { logger } from "./logger";

function resolvePromptPath(filename: string): string | undefined {
  const seen = new Set<string>();

  const checkPath = (path: string): string | undefined => {
    if (seen.has(path)) {
      return undefined;
    }

    seen.add(path);
    return existsSync(path) ? path : undefined;
  };

  const fromEnv = process.env.PROMPTS_CONFIG_DIR;
  if (fromEnv) {
    const resolved = checkPath(join(fromEnv, filename));
    if (resolved) {
      return resolved;
    }
  }

  // Search from current working directory up to filesystem root
  let current = process.cwd();
  while (true) {
    const resolved = checkPath(join(current, "config", "prompts", filename));
    if (resolved) {
      return resolved;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return undefined;
}

/**
 * Load a prompt template from the config/prompts directory.
 * Falls back to inline default if file cannot be loaded.
 *
 * @param filename - Name of the prompt file (e.g., 'extraction.md')
 * @param fallback - Fallback prompt text if file loading fails
 * @returns The prompt template content
 */
export function loadPrompt(filename: string, fallback: string): string {
  const sanitizedFilename = filename.trim();
  if (!sanitizedFilename || sanitizedFilename !== basename(sanitizedFilename)) {
    logger.warn({ filename }, "Invalid prompt filename, using fallback");
    return fallback;
  }

  try {
    const promptPath = resolvePromptPath(sanitizedFilename);
    if (promptPath) {
      const content = readFileSync(promptPath, "utf-8");
      return content.trim();
    }

    logger.warn({ filename }, "Could not load prompt file, using fallback");
    return fallback;
  } catch (error) {
    logger.warn({ err: error, filename }, "Error loading prompt file");
    return fallback;
  }
}

/**
 * Default memory extraction prompt (fallback).
 */
export const DEFAULT_MEMORY_EXTRACTION_PROMPT = `You are a memory extraction assistant. Your job is to analyze conversations and extract important facts, preferences, and context about the user.

## Instructions

Given the following conversation, extract:

1. **Facts**: Concrete information the user shared (name, job, location, etc.)
2. **Preferences**: Things the user likes, dislikes, or prefers
3. **Events**: Notable events or experiences the user mentioned
4. **Context**: Situational information relevant to ongoing conversations

## Rules

- Only extract information explicitly stated or strongly implied
- Each memory should be self-contained and understandable without context
- Assign importance (0.0-1.0) based on likely future relevance
- Do not extract information about the AI assistant, only about the user
- Return an empty array [] if no meaningful memories can be extracted

## Output Format

Return ONLY a JSON array of memory objects, no other text:
[
  {
    "content": "User works as a software engineer at a startup",
    "type": "fact",
    "importance": 0.8
  },
  {
    "content": "User prefers async/await patterns over callbacks in JavaScript",
    "type": "preference",
    "importance": 0.6
  }
]

Valid types: "fact", "preference", "event", "context"

## Conversation

{{conversation}}`;

/**
 * Default trait extraction prompt (fallback).
 */
export const DEFAULT_TRAIT_EXTRACTION_PROMPT = `You are a user profiling assistant. Your job is to extract and update structured traits about a user based on their conversations.

## Available Traits
{{schemas}}

## Current User Profile
{{current_traits}}

## Instructions
Analyze the conversation and determine if any traits should be:
- **Created**: New trait not previously known
- **Updated**: Existing trait needs revision based on new information
- **Deleted**: Previous trait is now contradicted

## Rules
- Only update traits when you have sufficient evidence
- Provide a confidence score (0.0-1.0) based on certainty
- Higher confidence for explicit statements, lower for inferences
- If unsure, prefer not updating over guessing
- Return an empty array [] if no traits can be extracted

## Output Format
Return ONLY a JSON array of trait updates, no other text:
[
  {
    "key": "trait_key",
    "value": "trait_value",
    "confidence": 0.75,
    "action": "create|update|delete",
    "reason": "Brief explanation"
  }
]

## Conversation
{{conversation}}`;

/**
 * Default profile summarization prompt (fallback).
 */
export const DEFAULT_SUMMARIZATION_PROMPT = `You are a profile summarization assistant. Create a concise, natural language summary of a user based on their traits and memories.

## User Traits
{{traits}}

## Recent Memories
{{memories}}

## Instructions
Write a 2-3 sentence summary describing who this user is, written in third person. Include:
- Key identifying information (if known)
- Communication preferences
- Relevant context for conversations

## Rules
- Be concise (100-200 tokens max)
- Write naturally, as if describing a person to a colleague
- Focus on information relevant for conversation assistance
- Do not include speculative information
- Do not include low-confidence traits (< 0.5)

## Output
Write the summary directly, no JSON formatting needed.`;
