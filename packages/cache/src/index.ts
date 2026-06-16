/**
 * @tryit/cache — content-addressed, tenant-namespaced result cache for TryIt.
 *
 * Keys are derived deterministically from request content (tenant, person-image
 * content hash, product, and canonical params) via node:crypto, so identical
 * try-on requests hit the cache instead of re-running an expensive provider call.
 * Keys are tenant-namespaced to make cross-tenant cache poisoning (T1) impossible.
 * No external runtime dependency is required.
 *
 * This file is a barrel — the implementation lives in focused, single-purpose
 * modules (canonical-json, cache-key, cache-store, result-cache).
 */

export type { JsonValue } from './canonical-json.js';
export { canonicalJsonStringify } from './canonical-json.js';

export type { CacheKeyParts } from './cache-key.js';
export { deriveCacheKey, hashImageBytes } from './cache-key.js';

export type {
  Clock,
  CacheStore,
  InMemoryCacheStoreOptions,
} from './cache-store.js';
export { InMemoryCacheStore } from './cache-store.js';

export type {
  ResultCacheOptions,
  CacheOutcome,
} from './result-cache.js';
export { ResultCache } from './result-cache.js';
