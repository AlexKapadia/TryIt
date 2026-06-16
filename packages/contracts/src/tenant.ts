/**
 * @tryit/contracts/tenant — per-tenant policy and configuration contract.
 *
 * Every tenant carries an isolation- and safety-relevant policy: which providers it may use,
 * its rate limits, its monthly spend cap, how long results are retained, and a per-tenant
 * kill switch. These are security controls, so the schema bounds them and `killSwitch`
 * defaults to `false` (a missing flag must not silently leave a tenant in an undefined state).
 * Config is parsed at load; a malformed tenant record fails closed rather than disabling a cap.
 */

import { z } from 'zod';
import { ProviderIdSchema } from './providers.js';

/**
 * Rate limits applied to a tenant. Both are positive integers — a non-positive limit would
 * either block all traffic or (if misread) disable the limiter, so the floor is 1 request.
 */
export const RateLimitSchema = z.object({
  perShopperPerMinute: z.number().int().min(1),
  perTenantPerMinute: z.number().int().min(1),
});

/** Validated per-tenant rate limits. */
export type RateLimit = z.infer<typeof RateLimitSchema>;

/**
 * A tenant's policy configuration.
 *
 * `allowedProviders` is the allow-list the router intersects against (deny by default — an
 * empty list permits nothing). `monthlyBudgetUsd` and `retentionSeconds` are non-negative.
 * `killSwitch` defaults to `false`; when `true` all of the tenant's external calls are halted.
 */
export const TenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  // Allow-list of providers this tenant may route to; deny-by-default if empty.
  allowedProviders: z.array(ProviderIdSchema),
  rateLimit: RateLimitSchema,
  monthlyBudgetUsd: z.number().nonnegative(),
  retentionSeconds: z.number().int().nonnegative(),
  // fail-closed control: when true, the tenant's external calls are halted entirely.
  killSwitch: z.boolean().default(false),
});

/** A validated tenant configuration. */
export type TenantConfig = z.infer<typeof TenantConfigSchema>;

/**
 * Parse an unknown input into a validated {@link TenantConfig}.
 *
 * @returns The parsed config with `killSwitch` defaulted to `false` when omitted.
 * @throws {z.ZodError} if the input does not satisfy {@link TenantConfigSchema}.
 */
export function parseTenantConfig(input: unknown): TenantConfig {
  // fail-closed: a malformed tenant policy is rejected rather than partially applied.
  return TenantConfigSchema.parse(input);
}

/** Non-throwing variant of {@link parseTenantConfig}. */
export function safeParseTenantConfig(
  input: unknown,
): z.SafeParseReturnType<unknown, TenantConfig> {
  return TenantConfigSchema.safeParse(input);
}
