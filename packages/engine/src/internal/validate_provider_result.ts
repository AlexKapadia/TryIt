/**
 * @tryit/engine/internal/validate_provider_result — re-validate untrusted upstream results.
 *
 * Provider adapters map external responses (fal, replicate, google, self-hosted) into a
 * {@link TryOnResult}. Those responses are untrusted I/O, so before any mapped result leaves a
 * provider it is parsed against the contract schema. This enforces, among other things, the
 * https-only result-URL invariant and non-negative latency/cost — fail-closed: a malformed
 * upstream payload is rejected (thrown) rather than surfaced to the caller.
 */

import { safeParseTryOnResult, type TryOnResult } from '@tryit/contracts';

/**
 * Validate a candidate result against the contract, throwing on any violation.
 *
 * @param candidate The provider-mapped result (untrusted shape).
 * @param providerLabel Used only to make the thrown error message actionable.
 * @returns The same value, now proven to satisfy {@link TryOnResult}.
 * @throws Error if the candidate does not satisfy the result contract.
 */
export function validateProviderResult(candidate: unknown, providerLabel: string): TryOnResult {
  const parsed = safeParseTryOnResult(candidate);
  if (!parsed.success) {
    // fail-closed: surface a typed failure so the router falls through rather than returning
    // a result that violates the wire contract (e.g. a non-https or http result URL).
    throw new Error(`${providerLabel}: malformed provider result — ${parsed.error.message}`);
  }
  return parsed.data;
}
