/**
 * @tryit/cache — tenant-namespaced cache key derivation.
 *
 * What this does: turns the content of a try-on request (tenant, the person
 * image's content hash, the product, and normalized params) into a stable hex
 * SHA-256 cache key, plus a helper to hash raw image bytes.
 *
 * Why it exists / security invariant (threat T1 — cross-tenant cache poisoning):
 * the key is TENANT-NAMESPACED two ways. The `tenantId` is (a) folded into the
 * hashed material via a length-prefixed, domain-separated encoding AND (b) used
 * as a literal key prefix. As a result two different tenants can NEVER produce
 * the same key for otherwise-identical inputs — one tenant can never read or
 * poison another tenant's cached result. Length-prefixing the fields also
 * prevents boundary-shifting collisions (e.g. tenant "ab"+product "c" must not
 * hash like tenant "a"+product "bc").
 *
 * Determinism: params are serialized with canonical (sorted-key) JSON so that
 * key ordering in the params object can never change the derived key.
 */

import { createHash } from 'node:crypto';
import { canonicalJsonStringify, type JsonValue } from './canonical-json.js';

/** Domain-separation tag mixed into every key so this scheme can't collide with others. */
const KEY_DOMAIN = 'tryit/cache/v1';

/** The content from which a cache key is derived. */
export interface CacheKeyParts {
  /** Tenant identifier. Namespaces the key — see threat T1 in the module docstring. */
  readonly tenantId: string;
  /** Hex content hash of the person image (see {@link hashImageBytes}). */
  readonly personImageHash: string;
  /** The product being tried on. */
  readonly productId: string;
  /** Structured request params; normalized via canonical JSON. */
  readonly params: JsonValue;
}

/**
 * Hash raw image bytes to a lowercase hex SHA-256 digest.
 *
 * Inputs: the image content as a Uint8Array/Buffer.
 * Output: 64-char lowercase hex string suitable for {@link CacheKeyParts.personImageHash}.
 * This makes the cache content-addressed: identical image bytes hash identically.
 */
export function hashImageBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Derive the tenant-namespaced hex SHA-256 cache key for a request.
 *
 * Inputs: {@link CacheKeyParts}. Output: a key of the form `<tenantId>:<sha256hex>`
 * where the digest is computed over a length-prefixed, domain-separated encoding
 * of every part (including the tenantId) and the canonical-JSON params.
 * Failure modes: throws if params contain unserializable values (delegated to
 * {@link canonicalJsonStringify}, fail-closed).
 */
export function deriveCacheKey(parts: CacheKeyParts): string {
  const canonicalParams = canonicalJsonStringify(parts.params);

  const hash = createHash('sha256');
  // Domain separation: distinguishes this scheme from any other SHA-256 use.
  hashField(hash, KEY_DOMAIN);
  // tenant isolation (T1): tenantId is part of the hashed material...
  hashField(hash, parts.tenantId);
  hashField(hash, parts.personImageHash);
  hashField(hash, parts.productId);
  hashField(hash, canonicalParams);
  const digest = hash.digest('hex');

  // ...AND a literal prefix, so keys from different tenants live in disjoint
  // namespaces even before the digest is considered.
  return `${prefixSafe(parts.tenantId)}:${digest}`;
}

/**
 * Feed one field into the digest with an unambiguous length prefix.
 *
 * Why length-prefixing: concatenating raw fields lets the boundary between them
 * shift (e.g. "ab"|"c" vs "a"|"bc") and collide. Encoding the byte length of
 * each UTF-8 field before the field makes the encoding injective, so distinct
 * tuples of fields can never produce the same hash input.
 */
function hashField(hash: ReturnType<typeof createHash>, field: string): void {
  const bytes = Buffer.from(field, 'utf8');
  hash.update(`${bytes.length}:`);
  hash.update(bytes);
}

/**
 * Make a tenantId safe to use as a literal key prefix.
 *
 * The prefix is delimited from the digest by ':'. To keep the prefix injective
 * (so two distinct tenantIds can't yield the same prefix) we percent-encode any
 * ':' and '%' the tenantId might contain, preserving the disjoint-namespace
 * guarantee even for adversarial tenant identifiers.
 */
function prefixSafe(tenantId: string): string {
  return tenantId.replace(/%/g, '%25').replace(/:/g, '%3A');
}
