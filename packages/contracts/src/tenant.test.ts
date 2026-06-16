import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseTenantConfig, safeParseTenantConfig } from './tenant.js';

/** A minimal valid tenant config that individual tests mutate. */
function baseConfig(): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    allowedProviders: ['fal', 'deterministic'],
    rateLimit: { perShopperPerMinute: 10, perTenantPerMinute: 100 },
    monthlyBudgetUsd: 500,
    retentionSeconds: 86_400,
  };
}

describe('parseTenantConfig', () => {
  it('parses a valid config and defaults killSwitch to false', () => {
    const config = parseTenantConfig(baseConfig());
    expect(config.killSwitch).toBe(false);
    expect(config.allowedProviders).toEqual(['fal', 'deterministic']);
  });

  it('preserves an explicit killSwitch = true', () => {
    expect(parseTenantConfig({ ...baseConfig(), killSwitch: true }).killSwitch).toBe(true);
  });

  it('accepts an empty allowedProviders list (deny-by-default)', () => {
    expect(parseTenantConfig({ ...baseConfig(), allowedProviders: [] }).allowedProviders).toEqual(
      [],
    );
  });

  it('rejects an unknown provider in allowedProviders', () => {
    expect(() => parseTenantConfig({ ...baseConfig(), allowedProviders: ['nope'] })).toThrow(
      ZodError,
    );
  });

  it('rejects perShopperPerMinute = 0 (boundary: just-under min 1)', () => {
    expect(() =>
      parseTenantConfig({ ...baseConfig(), rateLimit: { perShopperPerMinute: 0, perTenantPerMinute: 100 } }),
    ).toThrow(ZodError);
  });

  it('accepts perShopperPerMinute = 1 (boundary: at min)', () => {
    const config = parseTenantConfig({
      ...baseConfig(),
      rateLimit: { perShopperPerMinute: 1, perTenantPerMinute: 1 },
    });
    expect(config.rateLimit.perShopperPerMinute).toBe(1);
  });

  it('rejects a non-integer rate limit', () => {
    expect(() =>
      parseTenantConfig({ ...baseConfig(), rateLimit: { perShopperPerMinute: 1.5, perTenantPerMinute: 100 } }),
    ).toThrow(ZodError);
  });

  it('rejects a negative monthlyBudgetUsd (boundary: just-under 0)', () => {
    expect(() => parseTenantConfig({ ...baseConfig(), monthlyBudgetUsd: -1 })).toThrow(ZodError);
  });

  it('accepts monthlyBudgetUsd = 0 (boundary: at 0)', () => {
    expect(parseTenantConfig({ ...baseConfig(), monthlyBudgetUsd: 0 }).monthlyBudgetUsd).toBe(0);
  });

  it('rejects a negative retentionSeconds (boundary: just-under 0)', () => {
    expect(() => parseTenantConfig({ ...baseConfig(), retentionSeconds: -1 })).toThrow(ZodError);
  });

  it('rejects a non-integer retentionSeconds', () => {
    expect(() => parseTenantConfig({ ...baseConfig(), retentionSeconds: 1.5 })).toThrow(ZodError);
  });

  it('throws when tenantId is missing', () => {
    const { tenantId: _omit, ...rest } = baseConfig();
    expect(() => parseTenantConfig(rest)).toThrow(ZodError);
  });

  it('safeParse fails for a missing rateLimit', () => {
    const { rateLimit: _omit, ...rest } = baseConfig();
    expect(safeParseTenantConfig(rest).success).toBe(false);
  });
});
