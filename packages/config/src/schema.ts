// Configuration schema using Zod
// Based on the technical plan

import { z } from 'zod';

export const databaseConfigSchema = z.object({
  url: z.string(),
  poolSize: z.number().optional().default(10),
  idle_timeout: z.number().optional(),
  connect_timeout: z.number().optional(),
});

export const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'custom']),
  apiKey: z.string().optional(),
  model: z.string(),
  baseUrl: z.string().optional(),
});

export const upstreamConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'custom']),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export const memoryConfigSchema = z.object({
  maxMessagesPerProfile: z.number().default(1000),
  extractionEnabled: z.boolean().default(true),
  summarizationInterval: z.number().default(60),
  retentionDays: z.number().optional(),
});

export const traitsConfigSchema = z.object({
  schemaPath: z.string().optional(),
  extractionEnabled: z.boolean().default(true),
  defaultTraitsEnabled: z.boolean().default(true),
  allowRequestOverride: z.boolean().default(true),
});

export const promptsConfigSchema = z.object({
  extractionPath: z.string().optional(),
  traitExtractionPath: z.string().optional(),
  summarizationPath: z.string().optional(),
});

export const serverConfigSchema = z.object({
  port: z.number().default(3100),
  host: z.string().default('0.0.0.0'),
});

export const getProfileConfigSchema = z.object({
  database: databaseConfigSchema,
  llm: llmConfigSchema,
  upstream: upstreamConfigSchema,
  memory: memoryConfigSchema,
  traits: traitsConfigSchema,
  prompts: promptsConfigSchema.optional(),
  server: serverConfigSchema,
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type LLMConfig = z.infer<typeof llmConfigSchema>;
export type UpstreamConfig = z.infer<typeof upstreamConfigSchema>;
export type MemoryConfig = z.infer<typeof memoryConfigSchema>;
export type TraitsConfig = z.infer<typeof traitsConfigSchema>;
export type PromptsConfig = z.infer<typeof promptsConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type GetProfileConfig = z.infer<typeof getProfileConfigSchema>;
