// Core constants used across the GetProfile codebase
// Extracted from magic numbers to improve maintainability

/**
 * Default values for memory retrieval
 */
export const MEMORY_DEFAULTS = {
  /** Default number of memories to retrieve */
  DEFAULT_LIMIT: 10,
  /** Default minimum importance threshold for memories */
  DEFAULT_MIN_IMPORTANCE: 0.3,
  /** Default importance value when not specified */
  DEFAULT_IMPORTANCE: 0.5,
  /** Default decay factor for memories */
  DEFAULT_DECAY_FACTOR: 1.0,
} as const;

/**
 * Default values for trait extraction
 */
export const TRAIT_DEFAULTS = {
  /** Default confidence value when not specified */
  DEFAULT_CONFIDENCE: 0.5,
  /** Minimum confidence threshold multiplier for injection (0.5 = 50% of threshold) */
  INJECTION_CONFIDENCE_MULTIPLIER: 0.5,
} as const;

/**
 * Default values for profile summarization
 */
export const SUMMARIZATION_DEFAULTS = {
  /** Default summarization interval in minutes */
  DEFAULT_INTERVAL_MINUTES: 60,
  /** Default number of top memories to include in summary */
  TOP_MEMORIES_COUNT: 10,
  /** Minimum confidence threshold for traits in summary */
  MIN_TRAIT_CONFIDENCE: 0.5,
} as const;

/**
 * Profile manager defaults
 */
export const PROFILE_DEFAULTS = {
  /** Default maximum messages per profile before retention */
  DEFAULT_MAX_MESSAGES: 1000,
  /** Default summarization interval in minutes */
  DEFAULT_SUMMARIZATION_INTERVAL: 60,
} as const;
