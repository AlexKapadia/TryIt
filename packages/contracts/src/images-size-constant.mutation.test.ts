/**
 * Mutation-hardening test pinning the decoded-size limit constant in images.ts.
 *
 * The existing boundary tests build their payloads from the exported MAX_BASE64_DECODED_BYTES,
 * so a mutation of the `8 * 1024 * 1024` expression would shift the test boundary in lockstep
 * and survive. Asserting the constant's EXACT integer value kills the arithmetic-operator
 * mutants (`*`->`/`) outright, locking the 8 MiB memory bound in place.
 */
import { describe, expect, it } from 'vitest';
import { MAX_BASE64_DECODED_BYTES } from './images.js';

describe('MAX_BASE64_DECODED_BYTES (mutation-hardening)', () => {
  it('is exactly 8 MiB = 8388608 bytes (pins the arithmetic, not a derived value)', () => {
    // Hardcoded literal — NOT 8*1024*1024 — so any mutation of the source expression diverges.
    expect(MAX_BASE64_DECODED_BYTES).toBe(8388608);
  });
});
