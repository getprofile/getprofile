// Configuration file loader
// Loads and validates config/getprofile.json with environment variable substitution

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { getProfileConfigSchema, type GetProfileConfig } from "./schema";
import { defaultConfig } from "./defaults";

/**
 * Resolve environment variable references in a string.
 * Supports ${VAR_NAME} syntax.
 */
function resolveEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const envValue = process.env[varName.trim()];
      if (envValue === undefined) {
        console.warn(
          `⚠️  Environment variable ${varName} not found, using literal: ${match}`
        );
        return match;
      }
      return envValue;
    });
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars);
  }
  if (value && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Skip comment fields
      if (key.startsWith("$")) {
        continue;
      }
      resolved[key] = resolveEnvVars(val);
    }
    return resolved;
  }
  return value;
}

/**
 * Find the config file path.
 * Searches from current working directory up to project root.
 */
function findConfigPath(): string | null {
  const configFileName = "getprofile.json";
  const configDirName = "config";

  // Check if explicitly set via environment variable
  const configPath = process.env.GETPROFILE_CONFIG_PATH;
  if (configPath && existsSync(configPath)) {
    return configPath;
  }

  // Search from current working directory
  let current = process.cwd();
  const seen = new Set<string>();

  while (true) {
    const configFile = join(current, configDirName, configFileName);
    if (existsSync(configFile)) {
      return configFile;
    }

    // Prevent infinite loops
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Load configuration from file and environment variables.
 *
 * Priority:
 * 1. Environment variables (for secrets and server settings)
 * 2. config/getprofile.json (for structured configuration)
 * 3. Default values
 *
 * @param configPath - Optional explicit path to config file
 * @returns Validated configuration object
 */
export function loadConfig(configPath?: string): GetProfileConfig {
  // Start with defaults
  const config: Partial<GetProfileConfig> = { ...defaultConfig };

  // Try to load from file
  const filePath = configPath || findConfigPath();
  if (filePath) {
    try {
      const fileContent = readFileSync(filePath, "utf-8");
      const fileConfig = JSON.parse(fileContent);

      // Resolve environment variable references
      const resolved = resolveEnvVars(fileConfig) as Partial<GetProfileConfig>;

      // Merge file config into defaults (file takes precedence)
      Object.assign(config, resolved);

      console.log(`✅ Loaded configuration from ${filePath}`);
    } catch (error) {
      console.warn(
        `⚠️  Failed to load config file ${filePath}:`,
        error instanceof Error ? error.message : error
      );
    }
  } else {
    console.log(
      "ℹ️  No config file found, using environment variables and defaults"
    );
  }

  // Override with environment variables (highest priority for secrets)
  // Database
  if (process.env.DATABASE_URL) {
    config.database = {
      ...config.database,
      url: process.env.DATABASE_URL,
    } as GetProfileConfig["database"];
  }

  // LLM Provider
  if (
    process.env.LLM_PROVIDER ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  ) {
    const provider =
      (process.env.LLM_PROVIDER?.toLowerCase() as
        | "openai"
        | "anthropic"
        | "custom") || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
    const apiKey =
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY;
    const model = process.env.LLM_MODEL || config.llm?.model || "gpt-5-mini";
    const baseUrl = process.env.LLM_BASE_URL || config.llm?.baseUrl;

    config.llm = {
      provider,
      apiKey,
      model,
      baseUrl,
    };
  }

  // Upstream Provider
  if (process.env.UPSTREAM_PROVIDER || process.env.UPSTREAM_API_KEY) {
    const provider =
      (process.env.UPSTREAM_PROVIDER?.toLowerCase() as
        | "openai"
        | "anthropic"
        | "custom") ||
      config.upstream?.provider ||
      "openai";
    const apiKey =
      process.env.UPSTREAM_API_KEY ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      config.upstream?.apiKey;
    const baseUrl = process.env.UPSTREAM_BASE_URL || config.upstream?.baseUrl;

    config.upstream = {
      provider,
      apiKey,
      baseUrl,
    };
  }

  // Memory settings
  if (process.env.GETPROFILE_MAX_MESSAGES) {
    const maxMessages = Number.parseInt(
      process.env.GETPROFILE_MAX_MESSAGES,
      10
    );
    if (Number.isFinite(maxMessages) && maxMessages > 0) {
      config.memory = {
        maxMessagesPerProfile: maxMessages,
        extractionEnabled: config.memory?.extractionEnabled ?? true,
        summarizationInterval: config.memory?.summarizationInterval ?? 60,
        retentionDays: config.memory?.retentionDays,
      };
    }
  }
  if (process.env.GETPROFILE_SUMMARY_INTERVAL) {
    const interval = Number.parseInt(
      process.env.GETPROFILE_SUMMARY_INTERVAL,
      10
    );
    if (Number.isFinite(interval) && interval > 0) {
      config.memory = {
        maxMessagesPerProfile: config.memory?.maxMessagesPerProfile ?? 1000,
        extractionEnabled: config.memory?.extractionEnabled ?? true,
        summarizationInterval: interval,
        retentionDays: config.memory?.retentionDays,
      };
    }
  }

  // Server settings
  if (process.env.PORT) {
    const port = Number.parseInt(process.env.PORT, 10);
    if (Number.isFinite(port) && port > 0) {
      config.server = {
        port,
        host: config.server?.host ?? "0.0.0.0",
      };
    }
  }
  if (process.env.HOST) {
    config.server = {
      port: config.server?.port ?? 3100,
      host: process.env.HOST,
    };
  }

  // Ensure required fields are present
  if (!config.database?.url) {
    throw new Error(
      "DATABASE_URL is required. Set it as an environment variable or in config/getprofile.json"
    );
  }

  if (!config.llm) {
    throw new Error(
      "LLM configuration is required. Set LLM_API_KEY or configure in config/getprofile.json"
    );
  }

  if (!config.upstream) {
    // Default upstream to same as LLM if not configured
    config.upstream = {
      provider: config.llm.provider,
      apiKey: config.llm.apiKey,
      baseUrl: config.llm.baseUrl,
    };
  }

  // Validate and return
  const result = getProfileConfigSchema.parse(config);
  return result;
}

/**
 * Get configuration singleton.
 * Loads config once and caches it.
 */
let cachedConfig: GetProfileConfig | null = null;

export function getConfig(configPath?: string): GetProfileConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  cachedConfig = loadConfig(configPath);
  return cachedConfig;
}

/**
 * Reset cached configuration (useful for testing).
 */
export function resetConfig(): void {
  cachedConfig = null;
}
