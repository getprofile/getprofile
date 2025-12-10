// Default configuration values
// Based on the technical plan

import type { GetProfileConfig } from './schema';

export const defaultConfig: Partial<GetProfileConfig> = {
  memory: {
    maxMessagesPerProfile: 1000,
    extractionEnabled: true,
    summarizationInterval: 60,
  },
  traits: {
    extractionEnabled: true,
    defaultTraitsEnabled: true,
    allowRequestOverride: true,
  },
  server: {
    port: 3100,
    host: '0.0.0.0',
  },
};

