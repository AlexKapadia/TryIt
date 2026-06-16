/**
 * @tryit/contracts/providers — try-on provider identity and configuration contracts.
 *
 * The engine routes each request to one of several interchangeable image providers. This
 * module pins the closed set of provider ids and the per-provider operational config the
 * router uses (enablement, priority ordering, cost accounting, timeouts, concurrency caps).
 * Config is parsed at load time so a malformed provider entry fails closed rather than
 * silently disabling a guardrail (e.g. an unbounded timeout or concurrency).
 */

import { z } from 'zod';

/**
 * The closed set of supported provider backends. `deterministic` is the always-available,
 * non-AI fallback that produces a reproducible result so the engine never hard-fails.
 */
export const ProviderIdSchema = z.enum([
  'fal',
  'replicate',
  'google-vto',
  'self-hosted',
  'deterministic',
]);

/** A supported provider backend id. */
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/**
 * Operational configuration for a single provider.
 *
 * `priority` orders providers for routing (lower = preferred). `costPerCallUsd` feeds budget
 * accounting and is non-negative. `timeoutMs` and `maxConcurrency` are bounded and at least 1
 * so a misconfiguration cannot remove the timeout/concurrency guardrails entirely.
 */
export const ProviderConfigSchema = z.object({
  id: ProviderIdSchema,
  enabled: z.boolean(),
  priority: z.number().int(),
  costPerCallUsd: z.number().nonnegative(),
  // Bound the timeout to a sane window: at least 1ms, at most 5 minutes.
  timeoutMs: z.number().int().min(1).max(300_000),
  // At least one in-flight call; capped so a single provider cannot monopolise resources.
  maxConcurrency: z.number().int().min(1).max(1000),
});

/** A validated provider configuration. */
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Parse an unknown input into a validated {@link ProviderId}.
 *
 * @throws {z.ZodError} if the input is not a known provider id.
 */
export function parseProviderId(input: unknown): ProviderId {
  return ProviderIdSchema.parse(input);
}

/** Non-throwing variant of {@link parseProviderId}. */
export function safeParseProviderId(input: unknown): z.SafeParseReturnType<unknown, ProviderId> {
  return ProviderIdSchema.safeParse(input);
}

/**
 * Parse an unknown input into a validated {@link ProviderConfig}.
 *
 * @throws {z.ZodError} if the input does not satisfy {@link ProviderConfigSchema}.
 */
export function parseProviderConfig(input: unknown): ProviderConfig {
  // fail-closed: a malformed provider config is rejected rather than partially applied.
  return ProviderConfigSchema.parse(input);
}

/** Non-throwing variant of {@link parseProviderConfig}. */
export function safeParseProviderConfig(
  input: unknown,
): z.SafeParseReturnType<unknown, ProviderConfig> {
  return ProviderConfigSchema.safeParse(input);
}
