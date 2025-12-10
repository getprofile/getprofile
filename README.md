<p align="center">
  <h1 align="center">Get<strong>Profile</strong></h1>
  <p align="center">
    <strong>User profile and long-term memory for your AI agents</strong>
  </p>
  <p align="center">
    Drop-in LLM proxy that gives AI model persistent memory and structured user understanding
  </p>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#configuration">Configuration</a> •
  <a href="https://docs.getprofile.org">Documentation</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/getprofile/getprofile/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License">
  </a>
  <a href="https://www.npmjs.com/package/@getprofile/sdk-js">
    <img src="https://img.shields.io/npm/v/@getprofile/sdk-js.svg" alt="npm version">
  </a>
  <a href="https://x.com/GetProfileAI">
    <img src="https://img.shields.io/twitter/follow/GetProfileAI?style=social" alt="Follow on X">
  </a>
</p>

---

## The Problem

LLMs are stateless. Every conversation starts from scratch. Your AI assistant doesn't remember:

- User preferences ("I prefer concise answers")
- Past context ("We discussed this project last week")
- Personal details ("I'm a Python developer working at a startup")

This makes AI interactions feel impersonal and repetitive.

## The Solution

GetProfile is a **drop-in LLM proxy** that automatically:

1. **Captures** conversations between users and your AI
2. **Extracts** structured traits and memories using LLM analysis
3. **Injects** relevant context into every prompt
4. **Updates** user profiles and memory continuously in the background

Just change your LLM base URL. Works with **OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible API**.

```typescript
// Before: Stateless AI
const client = new OpenAI({ apiKey: "sk-..." });

// After: AI with memory (OpenAI example)
const client = new OpenAI({
  apiKey: process.env.GETPROFILE_API_KEY || "not-needed-for-local",
  baseURL: "https://api.yourserver.com/v1", // Or your self-hosted instance
  defaultHeaders: {
    "X-GetProfile-Id": userId, // Your app's user ID
    "X-Upstream-Key": "sk-...", // Your LLM provider API key
    "X-Upstream-Provider": "openai", // openai, anthropic, or custom
  },
});
```

### What Gets Injected

GetProfile adds a system message with user profile summary, traits, and relevant memories:

```
## User Profile
Alex is an experienced software engineer who prefers concise, technical explanations.
They work primarily with Python and have been exploring distributed systems.

## User Attributes
- Communication style: technical
- Detail preference: brief
- Expertise level: advanced

## Relevant Memories
- User mentioned working on a microservices migration last week
- User prefers async/await patterns over callbacks
```

No overloaded prompts and context windows, no blackbox solutions with unpredictable behavior — just relevant, structured information you define.

## Features

### Structured User Profiles

Unlike generic memory solutions that store blobs of text, GetProfile extracts **typed traits** with confidence scores:

```json
{
  "name": { "value": "Alex", "confidence": 0.95 },
  "expertise_level": { "value": "advanced", "confidence": 0.8 },
  "communication_style": { "value": "technical", "confidence": 0.7 },
  "interests": {
    "value": ["Python", "distributed systems", "ML"],
    "confidence": 0.6
  }
}
```

### Multiple Integration Options

- **LLM-agnostic proxy** — works with OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible API
- **JavaScript SDK** — programmatic access from Node.js/TypeScript
- **Streaming support** — full SSE streaming passthrough
- **Multi-provider** — seamlessly switch between providers without code changes

### Customizable Trait Schema

Define what matters for your app. Create traits config file `/config/traits/my-app.traits.json`.

```json
{
  "traits": [
    {
      "key": "interests",
      "valueType": "enum",
      "enumValues": ["sports", "technology", "art", "music", "travel"],
      "extraction": {
        "promptSnippet": "Infer user's interests from context"
      },
      "injection": {
        "template": "User is interested in {{value}}."
      }
    }
  ]
}
```

### Per-Request Trait Overrides

Define traits dynamically in each request — perfect for A/B testing or context-specific extraction:

```typescript
const response = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Help me plan my trip" }],
  // GetProfile extension: override traits for this request only
  extra_body: {
    getprofile: {
      traits: [
        {
          key: "travel_preferences",
          valueType: "array",
          extraction: { promptSnippet: "Extract travel style preferences" },
          injection: { template: "User prefers: {{value}}" },
        },
      ],
    },
  },
});
```

### Open Source & Self-Hostable

- **Apache 2.0 licensed** — use it anywhere
- **Self-host with Docker** — your data stays with you
- **Transparent** — audit the code, understand what's happening

### Secure & Fast

- **Efficient database schema** — optimized for read/write performance
- **Scalable architecture** — suitable for production workloads
- **Background processing** — offload trait extraction to workers
- **API key authentication** — protect your instance
- **GDPR-compliant** data export and deletion

### Comparison

| Feature                | GetProfile                              | Mem0                  | Supermemory                        |
| ---------------------- | --------------------------------------- | --------------------- | ---------------------------------- |
| **Long-term Memory**   | ✅ Semantic summary and relevant events | ✅ Contextual graph   | ✅ Semantic and associative memory |
| **Structured Traits**  | ✅ First-class, typed                   | ❌ Unstructured facts | ❌ Static/dynamic facts            |
| **Custom Schema**      | ✅ JSON configurable                    | ❌ Fixed              | ❌ Fixed                           |
| **Per-Request Traits** | ✅ Dynamic override                     | ❌ No                 | ❌ No                              |
| **LLM Proxy**          | ✅ Built-in                             | ❌ SDK only           | ✅ Memory Router                   |
| **Open Source**        | ✅ Apache 2.0                           | ✅ Apache 2.0         | ⚠️ Partial                         |
| **Self-Hostable**      | ✅ Docker-ready                         | ✅ Docker-ready       | ⚠️ Enterprise only                 |

**Our philosophy**: They store facts; we store facts **plus labels** on those facts, in a schema you control.

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/getprofile/getprofile.git
cd getprofile

# Configure environment
cp .env.docker.example .env
# Edit .env with your LLM_API_KEY (works with OpenAI, Anthropic, etc.)

# Start services (migrations run automatically)
docker compose -f docker/docker-compose.yml up -d

# GetProfile proxy is now running at http://localhost:3100
```

### Option 2: Local Development

```bash
# Prerequisites: Node.js 20+, pnpm, PostgreSQL

# Clone and install
git clone https://github.com/getprofile/getprofile.git
cd getprofile
pnpm install

# Set up database
cp .env.example .env
# Edit .env with your DATABASE_URL and LLM_API_KEY

# Run migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Option 3: npm Packages

```bash
# Install the SDK
npm install @getprofile/sdk-js

# Or use individual packages
npm install @getprofile/core @getprofile/db
```

## How It Works

### Proxy Integration (Transparent)

```
┌───────────────┐     ┌──────────────────────────────────┐     ┌─────────────────┐
│               │     │         GetProfile Proxy         │     │                 │
│   Your App    │────▶│                                  │────▶│   LLM Provider  │
│               │     │  1. Load user profile            │     │   (OpenAI, etc) │
│               │     │  2. Retrieve relevant memories   │     │                 │
└───────────────┘     │  3. Inject context into prompt   │     └─────────────────┘
                      │  4. Forward to LLM               │
                      │  5. Stream response back         │
                      │  6. Extract traits (background)  │
                      └──────────────────────────────────┘
```

## Configuration

### Environment Variables

GetProfile uses minimal environment variables - only secrets and high-level server config. Everything else goes in `config/getprofile.json`.

```bash
# Database (secret)
DATABASE_URL=postgresql://user:pass@localhost:5432/getprofile

# LLM API Key (secret - provider-agnostic)
LLM_API_KEY=sk-...                    # Works with OpenAI, Anthropic, OpenRouter, etc.
# OR use provider-specific keys:
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-...

# Server (high-level config)
PORT=3100
HOST=0.0.0.0
```

### Configuration File

Edit `config/getprofile.json` to customize settings. **Provider-agnostic** - works with OpenAI, Anthropic, or any compatible API:

```json
{
  "database": {
    "url": "${DATABASE_URL}",
    "poolSize": 10
  },
  "llm": {
    "provider": "openai", // openai, anthropic, or custom
    "apiKey": "${LLM_API_KEY}",
    "model": "gpt-5-mini" // or claude-4-5-sonnet
  },
  "upstream": {
    "provider": "openai", // Can be different from llm provider
    "apiKey": "${LLM_API_KEY}"
  },
  "memory": {
    "maxMessagesPerProfile": 1000,
    "summarizationInterval": 60
  },
  "traits": {
    "schemaPath": "./config/traits/default.traits.json",
    "extractionEnabled": true
  }
}
```

See [Configuration Guide](https://docs.getprofile.org/configuration/overview) for all options.

## API Reference

See [API Documentation](https://docs.getprofile.org/api-reference/introduction) for complete reference.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repo
git clone https://github.com/getprofile/getprofile.git
cd getprofile

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env

# Run database migrations
pnpm db:migrate

# Start development
pnpm dev

# Run tests
pnpm test
```

## Community

- 🐦 [X](https://x.com/GetProfileAI) — Updates and announcements
- 📧 [Email](mailto:admin@getprofile.org) — Direct contact

## Support

- 📖 [Documentation](https://docs.getprofile.org)
- 🐛 [Issue Tracker](https://github.com/getprofile/getprofile/issues)

## License

GetProfile is [Apache 2.0 licensed](./LICENSE).

---

<p align="center">
  <sub>Built with ❤️ for the AI community</sub>
</p>
