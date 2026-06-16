/**
 * @tryit/engine/internal/stable_request_hash — deterministic, dependency-free request hashing.
 *
 * The deterministic provider (see ../providers/deterministic.ts) must produce a byte-identical
 * placeholder for identical requests, with no network and no crypto module dependency that
 * could vary across runtimes. This module canonicalises a {@link TryOnRequest} into a stable
 * string (keys sorted, no incidental ordering) and folds it into a fixed-width hex digest with
 * the well-known FNV-1a 32-bit algorithm. The digest is a *non-cryptographic* fingerprint —
 * it is only ever used to derive a reproducible visual, never as a security primitive.
 */

import type { TryOnRequest } from '@tryit/contracts';

/**
 * Canonically serialise an arbitrary JSON-ish value with object keys sorted recursively, so
 * two structurally-equal requests serialise to the exact same string regardless of key order.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    // Primitives (and null) serialise directly; JSON.stringify handles escaping.
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** The 32-bit FNV-1a offset basis and prime — fixed by the algorithm specification. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Compute the FNV-1a 32-bit hash of a string as an unsigned integer.
 *
 * Pure and deterministic: identical input always yields the identical number, on every
 * runtime, with no allocation beyond the loop. Used only as a reproducible fingerprint.
 */
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i) & 0xff;
    // FNV-1a multiply; `Math.imul` keeps the result a 32-bit integer multiply.
    hash = Math.imul(hash, FNV_PRIME);
  }
  // `>>> 0` coerces to an unsigned 32-bit integer so the digest is stable and non-negative.
  return hash >>> 0;
}

/**
 * Produce a stable lowercase hex digest for a try-on request.
 *
 * Two FNV passes over the canonical form (one of the form itself, one of its reverse) widen
 * the fingerprint to 64 bits of hex so distinct requests are very unlikely to collide while
 * remaining fully deterministic and crypto-free.
 */
export function stableRequestHash(req: TryOnRequest): string {
  const canonical = canonicalize(req);
  const reversed = canonical.split('').reverse().join('');
  const high = fnv1a32(canonical);
  const low = fnv1a32(reversed);
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
