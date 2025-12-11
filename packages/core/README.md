# @getprofile/core

Core engine library for GetProfile - handles profile management, trait extraction, and memory operations.

## Overview

This package provides the core functionality for managing user profiles, extracting structured traits from conversations, and maintaining long-term memory. It's used internally by the GetProfile proxy server and SDK.

## Main Components

### ProfileManager

Main entry point for profile operations. Orchestrates profile, trait, and memory processing.

```typescript
import { ProfileManager } from '@getprofile/core';

const manager = new ProfileManager({
  llm: {
    apiKey: process.env.LLM_API_KEY,
    model: 'gpt-4o-mini',
  },
  traitExtractionEnabled: true,
  memoryExtractionEnabled: true,
});

// Get or create a profile
const profile = await manager.getOrCreateProfile('user-123');

// Process new messages and extract traits/memories
await manager.processConversation(profile.id, messages);

// Get enriched context for LLM injection
const context = await manager.buildContext(profile.id);

// Build injection text for system prompt
const injectionText = await manager.buildInjectionText(profile.id);
```

### TraitEngine

Extracts structured traits from conversations using LLM analysis.

```typescript
import { TraitEngine } from '@getprofile/core';

const engine = new TraitEngine({
  llm: { apiKey: 'sk-...', model: 'gpt-4o-mini' },
});

// Extract and apply traits from conversation (main entry point)
const updates = await engine.extractAndApply(profileId, messages, customSchemas);

// Or extract traits without applying (for analysis)
const existingTraits = await engine.getTraits(profileId);
const updates = await engine.extractTraits(messages, existingTraits, customSchemas);
```

### MemoryEngine

Handles memory extraction, retrieval, and profile summarization.

```typescript
import { MemoryEngine } from '@getprofile/core';

const engine = new MemoryEngine({
  llm: { apiKey: 'sk-...', model: 'gpt-4o-mini' },
  summarizationInterval: 60, // minutes
});

// Process messages and extract memories
await engine.processMessages(profileId, messages);

// Get relevant memories for context
const memories = await engine.retrieveMemories(profileId, query);

// Get recent memories regardless of importance
const recentMemories = await engine.getRecentMemories(profileId, limit);
```

## Exports

### Main exports

```typescript
import {
  // Managers
  ProfileManager,
  TraitEngine,
  MemoryEngine,

  // Types
  Profile,
  ProfileContext,
  Trait,
  TraitSchema,
  Memory,

  // Utils
  createLogger,
} from '@getprofile/core';
```

### Provider exports

```typescript
import { createProvider } from '@getprofile/core/providers';
```

### Constants

```typescript
import {
  TRAIT_DEFAULTS,
  MEMORY_DEFAULTS,
  PROFILE_DEFAULTS,
  SUMMARIZATION_DEFAULTS,
} from '@getprofile/core';
```

## Architecture

- **ProfileManager**: Coordinates trait and memory engines, manages profile lifecycle
- **TraitEngine**: LLM-powered trait extraction with customizable schemas
- **MemoryEngine**: Memory extraction, semantic retrieval, and summarization
- **Providers**: Abstraction layer for OpenAI, Anthropic, and custom LLM providers

## Configuration

The core package accepts minimal configuration focused on LLM settings and feature toggles:

```typescript
interface ProfileManagerConfig {
  llm?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  traitExtractionEnabled?: boolean;
  memoryExtractionEnabled?: boolean;
  summarizationInterval?: number;
  maxMessagesPerProfile?: number;
}
```

## Dependencies

- `@getprofile/db` - Database operations
- `@getprofile/config` - Configuration management
- `pino` - Logging

## Development

```bash
# Build the package
pnpm build

# Run tests
pnpm test

# Type checking
pnpm check-types

# Linting
pnpm lint
```

## License

Apache 2.0 - See LICENSE file in the project root.
