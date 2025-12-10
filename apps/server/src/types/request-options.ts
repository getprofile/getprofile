// Types for per-request GetProfile options
// These options can be passed in the request body under the 'getprofile' key

import type { TraitSchema } from '@getprofile/core';

/**
 * GetProfile-specific options that can be included in chat completion requests.
 * These options are stripped before forwarding to the upstream provider.
 */
export interface GetProfileRequestOptions {
  /**
   * Per-request trait schema overrides.
   * When provided, these schemas will be used instead of the default schemas
   * for this request only.
   */
  traits?: TraitSchema[];

  /**
   * Skip context injection for this request.
   * When true, the request is forwarded without adding profile context.
   */
  skipInjection?: boolean;

  /**
   * Skip background trait and memory extraction for this request.
   * When true, messages are not stored and no extraction occurs.
   */
  skipExtraction?: boolean;
}

/**
 * Validate GetProfile request options.
 * Returns validated options or null if invalid.
 */
export function validateGetProfileOptions(
  options: unknown
): GetProfileRequestOptions | null {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return null;
  }

  const opts = options as Record<string, unknown>;
  const result: GetProfileRequestOptions = {};

  // Validate skipInjection
  if ('skipInjection' in opts) {
    if (typeof opts.skipInjection !== 'boolean') {
      return null;
    }
    result.skipInjection = opts.skipInjection;
  }

  // Validate skipExtraction
  if ('skipExtraction' in opts) {
    if (typeof opts.skipExtraction !== 'boolean') {
      return null;
    }
    result.skipExtraction = opts.skipExtraction;
  }

  // Validate traits array
  if ('traits' in opts) {
    if (!Array.isArray(opts.traits)) {
      return null;
    }

    // Basic validation of trait schemas
    const traits = opts.traits as unknown[];
    const validatedTraits: TraitSchema[] = [];

    for (const trait of traits) {
      if (!trait || typeof trait !== 'object') {
        return null;
      }

      const t = trait as Record<string, unknown>;

      // Required fields
      if (
        typeof t.key !== 'string' ||
        typeof t.valueType !== 'string' ||
        !t.extraction ||
        typeof t.extraction !== 'object' ||
        !t.injection ||
        typeof t.injection !== 'object'
      ) {
        return null;
      }

      const extraction = t.extraction as Record<string, unknown>;
      const injection = t.injection as Record<string, unknown>;

      // Validate extraction and injection structure
      if (
        typeof extraction.enabled !== 'boolean' ||
        typeof extraction.confidenceThreshold !== 'number' ||
        typeof injection.enabled !== 'boolean' ||
        typeof injection.priority !== 'number'
      ) {
        return null;
      }

      // Valid trait schema
      validatedTraits.push(trait as TraitSchema);
    }

    result.traits = validatedTraits;
  }

  return result;
}
