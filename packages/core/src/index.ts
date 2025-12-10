/**
 * Copyright (c) 2025 GetProfile
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license text.
 */

// @getprofile/core - Memory & Trait Engine
// Core engine library for GetProfile

export * from "./types";
export * from "./profile";
export * from "./traits";
export * from "./memory";
export * from "./constants";
export * from "./utils/logger";

// Convenience re-exports for common use cases
export { ProfileManager } from "./profile/manager";
export { TraitEngine } from "./traits/engine";
export { MemoryEngine } from "./memory/engine";
