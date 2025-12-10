// Shared ProfileManager initializer for the proxy
// Ensures we only initialize the DB and manager once

import { ProfileManager } from '@getprofile/core';
import { initDatabase } from '@getprofile/db';
import { getConfig } from '@getprofile/config';
import { PROFILE_DEFAULTS } from '@getprofile/core';
import { createLogger } from '@getprofile/core';

const logger = createLogger({ name: 'profile-manager' });

let profileManager: ProfileManager | null = null;
let initPromise: Promise<ProfileManager> | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSummaryInterval(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Get the singleton ProfileManager instance.
 * Initializes the database connection on first use.
 * Uses configuration from config/getprofile.json or environment variables.
 */
export async function getProfileManager(): Promise<ProfileManager> {
  if (profileManager) {
    return profileManager;
  }

  if (!initPromise) {
    initPromise = (async () => {
      // Load configuration (from file or env vars)
      let config;
      try {
        config = getConfig();
      } catch (error) {
        // Fallback to environment variables if config loading fails
        logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Config loading failed, using environment variables');
        config = null;
      }

      // Initialize database
      const databaseUrl = config?.database?.url || process.env.DATABASE_URL;
      if (databaseUrl) {
        initDatabase({ url: databaseUrl });
      } else {
        logger.warn('DATABASE_URL not set. Database features will fail.');
      }

      // Get memory settings from config or env vars
      const maxMessagesPerProfile = config?.memory?.maxMessagesPerProfile ?? 
                                    parsePositiveInt(process.env.GETPROFILE_MAX_MESSAGES, PROFILE_DEFAULTS.DEFAULT_MAX_MESSAGES);
      const summarizationInterval = config?.memory?.summarizationInterval ?? 
                                    parseSummaryInterval(process.env.GETPROFILE_SUMMARY_INTERVAL, PROFILE_DEFAULTS.DEFAULT_SUMMARIZATION_INTERVAL);

      // Get LLM config for ProfileManager
      const llmConfig = config?.llm ? {
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
      } : undefined;

      const manager = new ProfileManager({
        llm: llmConfig,
        maxMessagesPerProfile,
        summarizationInterval,
        traitExtractionEnabled: config?.traits?.extractionEnabled,
        memoryExtractionEnabled: config?.memory?.extractionEnabled,
      });
      profileManager = manager;
      return manager;
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  const manager = await initPromise;
  profileManager = manager;
  initPromise = null;
  return manager;
}
