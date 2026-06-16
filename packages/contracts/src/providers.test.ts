import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import fc from 'fast-check';
import {
  parseProviderConfig,
  parseProviderId,
  ProviderIdSchema,
  safeParseProviderConfig,
  safeParseProviderId,
} from './providers.js';

/** A minimal valid provider config that individual tests mutate. */
function baseConfig(): Record<string, unknown> {
  return {
    id: 'fal',
    enabled: true,
    priority: 10,
    costPerCallUsd: 0.04,
    timeoutMs: 30_000,
    maxConcurrency: 8,
  };
}

describe('parseProviderId', () => {
  it('accepts every known provider id', () => {
    for (const id of ProviderIdSchema.options) {
      expect(parseProviderId(id)).toBe(id);
    }
  });

  it('rejects an unknown provider id', () => {
    expect(() => parseProviderId('midjourney')).toThrow(ZodError);
  });

  it('safeParseProviderId reports success for known and failure for unknown ids', () => {
    expect(safeParseProviderId('replicate').success).toBe(true);
    expect(safeParseProviderId('midjourney').success).toBe(false);
  });
});

describe('parseProviderConfig', () => {
  it('parses a valid config', () => {
    expect(parseProviderConfig(baseConfig())).toEqual({ ...baseConfig() });
  });

  it('accepts a negative priority (ordering may use any integer)', () => {
    expect(parseProviderConfig({ ...baseConfig(), priority: -5 }).priority).toBe(-5);
  });

  it('rejects a non-integer priority', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), priority: 1.5 })).toThrow(ZodError);
  });

  it('rejects a negative costPerCallUsd (boundary: just-under 0)', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), costPerCallUsd: -0.01 })).toThrow(ZodError);
  });

  it('accepts costPerCallUsd = 0 (boundary: at 0)', () => {
    expect(parseProviderConfig({ ...baseConfig(), costPerCallUsd: 0 }).costPerCallUsd).toBe(0);
  });

  it('rejects timeoutMs = 0 (boundary: just-under min 1)', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), timeoutMs: 0 })).toThrow(ZodError);
  });

  it('accepts timeoutMs = 1 (boundary: at min)', () => {
    expect(parseProviderConfig({ ...baseConfig(), timeoutMs: 1 }).timeoutMs).toBe(1);
  });

  it('accepts timeoutMs = 300000 (boundary: at max)', () => {
    expect(parseProviderConfig({ ...baseConfig(), timeoutMs: 300_000 }).timeoutMs).toBe(300_000);
  });

  it('rejects timeoutMs = 300001 (boundary: just-over max)', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), timeoutMs: 300_001 })).toThrow(ZodError);
  });

  it('rejects maxConcurrency = 0 (boundary: just-under min 1)', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), maxConcurrency: 0 })).toThrow(ZodError);
  });

  it('accepts maxConcurrency = 1 (boundary: at min)', () => {
    expect(parseProviderConfig({ ...baseConfig(), maxConcurrency: 1 }).maxConcurrency).toBe(1);
  });

  it('rejects maxConcurrency = 1001 (boundary: just-over max 1000)', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), maxConcurrency: 1001 })).toThrow(ZodError);
  });

  it('throws when id is unknown', () => {
    expect(() => parseProviderConfig({ ...baseConfig(), id: 'nope' })).toThrow(ZodError);
  });

  it('safeParse fails for a missing enabled flag', () => {
    const { enabled: _omit, ...rest } = baseConfig();
    expect(safeParseProviderConfig(rest).success).toBe(false);
  });

  it('property: timeoutMs strictly inside [1, 300000] always parses', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300_000 }), (timeoutMs) => {
        expect(safeParseProviderConfig({ ...baseConfig(), timeoutMs }).success).toBe(true);
      }),
    );
  });
});
