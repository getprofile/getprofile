# @getprofile/sdk-js

Official JavaScript/TypeScript SDK for [GetProfile](https://getprofile.org) - Drop-in OpenAI replacement with automatic personalization using user profiles, traits, and memories.

[![npm version](https://img.shields.io/npm/v/@getprofile/sdk-js.svg)](https://www.npmjs.com/package/@getprofile/sdk-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **🔄 OpenAI Compatible**: Drop-in replacement for OpenAI SDK with automatic profile context injection
- **🎯 Automatic Personalization**: User context automatically injected into chat completions
- **⚡ Lightweight & Fast**: Fully typed TypeScript SDK with zero runtime dependencies (16KB minified)
- **🧠 Smart Memory**: Automatically extracts and recalls user preferences, facts, and context
- **📊 Profile Management**: Create and manage user profiles with traits and memories
- **🏭 Production Ready**: Robust error handling, automatic retries, and comprehensive test coverage

## Installation

```bash
npm install @getprofile/sdk-js
```

```bash
pnpm add @getprofile/sdk-js
```

```bash
yarn add @getprofile/sdk-js
```

## Quick Start: OpenAI-Compatible Chat

The simplest way to use GetProfile is as a drop-in replacement for the OpenAI SDK. Just pass a `user` parameter and GetProfile automatically injects relevant user context.

```typescript
import { GetProfileClient } from "@getprofile/sdk-js";

const client = new GetProfileClient({
  apiKey: "your-api-key", // Your GetProfile server API key
});

// Just like OpenAI, but with automatic personalization
const completion = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "What should I work on today?" }],
  user: "user-123", // GetProfile automatically injects this user's context
});

console.log(completion.choices[0].message.content);
// Response will be personalized based on user's preferences, history, and traits
```

### Streaming Responses

```typescript
const stream = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Help me plan my week" }],
  stream: true,
  user: "user-123",
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  process.stdout.write(content);
}
```

## API Reference

### Client Initialization

```typescript
const client = new GetProfileClient({
  apiKey: 'your-api-key',           // Required: Your API key
  baseUrl?: 'https://api.yourserver.com', // Optional: Custom base URL
  timeout?: 30000,                   // Optional: Request timeout in ms
  retries?: 1,                       // Optional: Number of retry attempts
  retryDelayMs?: 250,                // Optional: Initial retry delay
  fetch?: customFetch,               // Optional: Custom fetch implementation
  defaultHeaders?: {},               // Optional: Additional headers
});
```

### Chat Completions (OpenAI Compatible)

GetProfile's chat API is fully compatible with OpenAI's API. Simply pass a `user` parameter to automatically inject personalized context.

#### Non-Streaming

```typescript
const completion = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What are my preferences?" },
  ],
  user: "user-123", // Automatically injects relevant profile context
  // All standard OpenAI parameters supported
});

console.log(completion.choices[0].message.content);
```

#### Streaming

```typescript
const stream = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Write me a personalized workout plan" }],
  stream: true,
  user: "user-123",
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  process.stdout.write(content);
}
```

#### Supported Parameters

All standard OpenAI chat completion parameters are supported:

- `model` - Model to use (e.g., 'gpt-5-mini', 'gpt-5', 'gpt-4-turbo')
- `messages` - Array of chat messages
- `user` - User identifier for automatic profile context injection
- `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`
- `max_tokens`, `stop`
- `stream` - Enable streaming responses

#### Advanced: Controlling Extraction and Injection

You can control what gets extracted from conversations and what context gets injected per request:

```typescript
// Skip context injection for this request (still extracts by default)
const completion = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Hello!" }],
  user: "user-123",
  getprofile: {
    skipInjection: true,
  },
});

// Skip extraction for this request (still injects context)
const completion = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Casual chat..." }],
  user: "user-123",
  getprofile: {
    skipExtraction: true,
  },
});

// Skip both extraction and injection (raw OpenAI request)
const completion = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Generic query" }],
  user: "user-123",
  getprofile: {
    skipInjection: true,
    skipExtraction: true,
  },
});

// Override trait extraction/injection for specific request
const completion = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Help me plan my trip" }],
  user: "user-123",
  getprofile: {
    traits: [
      {
        key: "travel_preferences",
        valueType: "object",
        extraction: {
          enabled: true,
          promptSnippet:
            "Extract travel preferences like destinations, budget, travel style",
        },
        injection: {
          enabled: true,
          template: "User travel preferences: {{value}}",
          priority: 9,
        },
      },
    ],
  },
});
```

#### List Available Models

```typescript
const models = await client.models.list();
console.log(models.data); // Array of available models
```

### Profile Management

Profiles store user information and are referenced by the `user` parameter in chat completions.

#### Get or Create Profile

```typescript
// Automatically creates profile if it doesn't exist
const profile = await client.getOrCreateProfile("user-123");
console.log(profile.id); // GetProfile internal ID
console.log(profile.externalId); // Your user ID ('user-123')
```

#### Get Profile Details

```typescript
// Returns null if profile doesn't exist (won't throw)
const profile = await client.getProfile("user-123");
if (profile) {
  console.log(profile.profile.summary);
  console.log(profile.traits); // User's traits
  console.log(profile.recentMemories); // Recent memories
}
```

#### List Profiles

```typescript
const result = await client.listProfiles({
  limit: 10,
  offset: 0,
  search: "john",
});
console.log(`Found ${result.total} profiles`);
```

#### Delete Profile

```typescript
const result = await client.deleteProfile("profile-id");
console.log(`Deleted ${result.deleted.traits} traits`);
console.log(`Deleted ${result.deleted.memories} memories`);
```

#### Export Profile Data

```typescript
const exportData = await client.exportProfile("profile-id");
// Returns complete profile with traits, memories, and message history
```

### Data Ingestion

Automatically extract traits and memories from unstructured text (e.g., from support tickets, CRM notes, onboarding forms):

```typescript
const result = await client.ingestData(
  "profile-id",
  "User loves coffee, prefers dark mode, and codes in TypeScript",
  {
    source: "chat", // Optional: Source identifier
    metadata: { sessionId: "123" }, // Optional: Additional metadata
    extractTraits: true, // Optional: Extract traits (default: true)
    extractMemories: true, // Optional: Extract memories (default: true)
  }
);

console.log(result.extracted.stats);
// { traitsCreated: 3, traitsUpdated: 1, memoriesCreated: 2 }
```

#### Selective Extraction Examples

```typescript
// Extract only traits (skip memories) - useful for structured onboarding data
await client.ingestData(
  "profile-id",
  "Name: Alex, Role: Engineer, Expertise: TypeScript, React",
  {
    source: "onboarding",
    extractTraits: true,
    extractMemories: false, // Skip memory extraction
  }
);

// Extract only memories (skip traits) - useful for conversation history
await client.ingestData(
  "profile-id",
  "User mentioned they are planning a trip to Japan next month",
  {
    source: "chat",
    extractTraits: false, // Skip trait extraction
    extractMemories: true,
  }
);

// Skip all extraction - just store raw data for later processing
await client.ingestData("profile-id", "Raw conversation transcript...", {
  source: "support",
  extractTraits: false,
  extractMemories: false,
});
```

### Traits (Advanced)

Traits are structured attributes about users (e.g., preferences, demographics).

#### List Traits

```typescript
const traits = await client.traits.list("profile-id");
// Returns: Trait[] with key, value, confidence, etc.
```

#### Update Trait

```typescript
const trait = await client.traits.update("profile-id", "favorite_language", {
  value: "TypeScript",
  confidence: 0.95,
});
```

#### Delete Trait

```typescript
await client.traits.delete("profile-id", "trait-key");
```

### Memories (Advanced)

Memories are temporal facts and context about users.

#### List Memories

```typescript
const memories = await client.memories.list("profile-id", {
  type: "preference", // Optional: 'fact' | 'preference' | 'event' | 'context'
  limit: 10, // Optional: Max results
});
```

#### Create Memory

```typescript
const memory = await client.memories.create("profile-id", {
  content: "User mentioned they love hiking on weekends",
  type: "preference",
  importance: 0.8, // Optional: 0-1 scale
});
```

#### Delete Memory

```typescript
await client.memories.delete("profile-id", "memory-id");
```

## Error Handling

The SDK throws `GetProfileError` for API errors with detailed information:

```typescript
import { GetProfileError } from "@getprofile/sdk-js";

try {
  await client.getProfile("non-existent");
} catch (error) {
  if (error instanceof GetProfileError) {
    console.error("Status:", error.status); // HTTP status code
    console.error("Code:", error.code); // Error code
    console.error("Type:", error.errorType); // Error type
    console.error("Message:", error.message); // Error message
    console.error("Details:", error.details); // Additional details
  }
}
```

The SDK automatically retries on:

- 429 (Rate Limit) errors
- 5xx (Server) errors
- Network timeouts

## TypeScript Support

The SDK is written in TypeScript and provides comprehensive type definitions:

```typescript
import type {
  ProfileDetail,
  ProfileSummary,
  Trait,
  Memory,
  ChatCompletion,
  IngestResult,
} from "@getprofile/sdk-js";
```

## Environment Support

- **Node.js**: 16.x or higher
- **Browsers**: Modern browsers with fetch support
- **Edge Runtime**: Vercel, Cloudflare Workers, etc.
- **Deno**: Import from npm specifier

## Examples

### Next.js App Router (Streaming Chat)

```typescript
// app/api/chat/route.ts
import { GetProfileClient } from "@getprofile/sdk-js";

const client = new GetProfileClient({
  apiKey: process.env.GETPROFILE_API_KEY!,
});

export async function POST(req: Request) {
  const { userId, messages } = await req.json();

  // GetProfile automatically injects user context
  const stream = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages,
    user: userId, // Automatically adds user's traits and memories to context
    stream: true,
  });

  // Stream the response back to the client
  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          controller.enqueue(new TextEncoder().encode(content));
        }
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    }
  );
}
```

### Express.js (Chat API)

```typescript
import express from "express";
import { GetProfileClient } from "@getprofile/sdk-js";

const app = express();
app.use(express.json());

const client = new GetProfileClient({
  apiKey: process.env.GETPROFILE_API_KEY!,
});

// Chat endpoint with automatic personalization
app.post("/api/chat", async (req, res) => {
  const { userId, messages } = req.body;

  const completion = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages,
    user: userId,
  });

  res.json(completion);
});

// Ingest user data to build profile
app.post("/api/profile/:userId/ingest", async (req, res) => {
  const { userId } = req.params;
  const { data } = req.body;

  const profile = await client.getOrCreateProfile(userId);
  const result = await client.ingestData(profile.id, data);

  res.json(result);
});
```

### Vercel AI SDK Integration

```typescript
import { GetProfileClient } from "@getprofile/sdk-js";
import { StreamingTextResponse } from "ai";

const client = new GetProfileClient({
  apiKey: process.env.GETPROFILE_API_KEY!,
});

export async function POST(req: Request) {
  const { userId, messages } = await req.json();

  const stream = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages,
    user: userId,
    stream: true,
  });

  // Convert to Vercel AI SDK compatible stream
  return new StreamingTextResponse(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk.choices[0]?.delta?.content || "");
        }
        controller.close();
      },
    })
  );
}
```

### Building User Profiles Over Time

```typescript
// As users interact with your app, build their profile
async function handleUserMessage(userId: string, message: string) {
  // 1. Get or create the profile
  const profile = await client.getOrCreateProfile(userId);

  // 2. Get personalized response
  const completion = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: message }],
    user: userId,
  });

  // 3. Optionally ingest the conversation to improve future personalization
  await client.ingestData(
    profile.id,
    `User: ${message}\nAssistant: ${completion.choices[0].message.content}`,
    { source: "chat" }
  );

  return completion.choices[0].message.content;
}
```

### Controlling Extraction and Injection

Control what gets learned and what context gets used on a per-request basis:

```typescript
// Example: Onboarding flow - extract traits but don't inject context yet
async function onboardUser(userId: string, onboardingData: string) {
  await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: "Extract user preferences from the onboarding form.",
      },
      { role: "user", content: onboardingData },
    ],
    user: userId,
    getprofile: {
      skipInjection: true, // Don't inject context during onboarding
      // Extraction still happens by default
    },
  });
}

// Example: Generic FAQ - skip both extraction and injection
async function handleFAQ(userId: string, question: string) {
  return await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: question }],
    user: userId,
    getprofile: {
      skipInjection: true, // Generic response, no personalization
      skipExtraction: true, // Don't learn from FAQ questions
    },
  });
}

// Example: Sensitive conversation - inject context but don't extract
async function handleSensitiveQuery(userId: string, query: string) {
  return await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: query }],
    user: userId,
    getprofile: {
      skipExtraction: true, // Don't store sensitive data
      // Still uses existing context for personalization
    },
  });
}

// Example: Domain-specific extraction with custom trait schema
async function handleTravelPlanning(userId: string, messages: any[]) {
  return await client.chat.completions.create({
    model: "gpt-5-mini",
    messages,
    user: userId,
    getprofile: {
      traits: [
        {
          key: "travel_budget",
          valueType: "enum",
          extraction: {
            enabled: true,
            promptSnippet: "budget, low, medium, high",
          },
          injection: {
            enabled: true,
            template: "Budget preference: {{value}}",
            priority: 8,
          },
        },
        {
          key: "preferred_destinations",
          valueType: "array",
          extraction: {
            enabled: true,
            promptSnippet: "countries or cities mentioned",
          },
          injection: {
            enabled: true,
            template: "Likes to travel to: {{value}}",
            priority: 7,
          },
        },
      ],
    },
  });
}

// Example: Batch import from CRM - extract traits only
async function importFromCRM(userId: string, crmNotes: string[]) {
  const profile = await client.getOrCreateProfile(userId);

  for (const note of crmNotes) {
    await client.ingestData(profile.id, note, {
      source: "crm",
      extractTraits: true, // Extract structured data
      extractMemories: false, // Skip memories for bulk import
      metadata: {
        importedAt: new Date().toISOString(),
      },
    });
  }
}
```

## Contributing

We welcome contributions! Please see our [contributing guidelines](../../CONTRIBUTING.md).

## License

MIT

## Support

- Documentation: [https://docs.getprofile.org](https://docs.getprofile.org)
- Issues: [GitHub Issues](https://github.com/getprofile/getprofile/issues)
- Email: support@getprofile.org

## Related Packages

- [@getprofile/core](../core) - Core profile engine
