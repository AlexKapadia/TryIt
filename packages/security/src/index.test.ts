/**
 * Barrel smoke test: confirms the package surface re-exports every control so a consumer can
 * import them from the package root, and that the exports are the real implementations.
 */
import { describe, expect, it } from 'vitest';
import {
  createApiKey,
  verifyApiKey,
  RateLimiter,
  InMemoryRateLimitStore,
  validateImageBytes,
  validateImageRef,
  sniffFormat,
  parseDimensions,
  InMemoryAuditSink,
  redactSecrets,
  PassthroughImageSanitizer,
  DEFAULT_IMAGE_LIMITS,
} from './index.js';

describe('public barrel surface', () => {
  it('re-exports all controls as callable values', () => {
    for (const fn of [
      createApiKey,
      verifyApiKey,
      validateImageBytes,
      validateImageRef,
      sniffFormat,
      parseDimensions,
      redactSecrets,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(typeof RateLimiter).toBe('function'); // class
    expect(typeof InMemoryRateLimitStore).toBe('function');
    expect(typeof InMemoryAuditSink).toBe('function');
    expect(typeof PassthroughImageSanitizer).toBe('function');
    expect(DEFAULT_IMAGE_LIMITS.maxBytes).toBeGreaterThan(0);
  });

  it('the re-exported createApiKey/verifyApiKey round-trip works through the barrel', () => {
    const { plaintext, record } = createApiKey({ tenantId: 't', scopes: [] });
    expect(verifyApiKey(plaintext, record, { tenantId: 't' })).toEqual({ ok: true });
  });
});
