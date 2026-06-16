/**
 * @tryit/engine/providers/deterministic — the always-available terminal fallback provider.
 *
 * This provider NEVER fails and NEVER touches the network or environment. It derives a stable
 * fingerprint from the request (see ../internal/stable_request_hash.ts) and returns a
 * reproducible placeholder result: an HTTPS URL that embeds the digest plus the base64-encoded
 * deterministic SVG. Identical requests therefore yield a byte-identical {@link TryOnResult}.
 * It is both the offline/CI default and the router's guaranteed last resort, so the engine can
 * always answer fail-closed without hard-erroring.
 */

import type { TryOnRequest, TryOnResult } from '@tryit/contracts';
import type { ProviderContext, TryOnProvider } from '../provider.js';
import { stableRequestHash } from '../internal/stable_request_hash.js';
import { buildPlaceholderSvg } from './deterministic_placeholder_svg.js';

/**
 * Host the deterministic results are namespaced under. It is a stable, HTTPS-scheme synthetic
 * origin (not a live server) so the result satisfies the contract's https-only invariant while
 * remaining obviously a placeholder. The digest fully determines the path.
 */
export const DETERMINISTIC_RESULT_ORIGIN = 'https://placeholder.tryit.dev/deterministic';

/** Base64-encode a UTF-8 string without depending on the platform `btoa`/`Buffer` ambiguity. */
function base64Utf8(input: string): string {
  // Node's Buffer is always available in the runtime targets; deterministic and offline.
  return Buffer.from(input, 'utf-8').toString('base64');
}

/**
 * Build the stable HTTPS result URL for a digest: a namespaced path carrying the digest and
 * the placeholder SVG as a base64 query parameter so the artefact is self-contained and the
 * URL is a pure function of the request.
 */
function buildResultUrl(digest: string): string {
  const svg = buildPlaceholderSvg(digest);
  const encoded = base64Utf8(svg);
  return `${DETERMINISTIC_RESULT_ORIGIN}/${digest}.svg?img=${encoded}`;
}

/**
 * The terminal, offline, reproducible provider.
 *
 * `tryOn` ignores the context's network-oriented fields (there is no I/O) but still honours an
 * already-aborted signal by failing closed, so a caller that cancelled before invoking does not
 * receive a result it no longer wants. Cost is always zero — no external call is made.
 */
export class DeterministicProvider implements TryOnProvider {
  public readonly id = 'deterministic' as const;

  public async tryOn(req: TryOnRequest, ctx: ProviderContext): Promise<TryOnResult> {
    // fail-closed: if the caller already aborted, do not fabricate a result they cancelled.
    if (ctx.signal.aborted) {
      throw new Error('deterministic: request already aborted');
    }
    const digest = stableRequestHash(req);
    ctx.logger.debug('deterministic.tryOn', { digest, tenantId: req.tenantId });
    return {
      resultImageUrl: buildResultUrl(digest),
      provider: this.id,
      // latency/cost are set authoritatively by the router; locals here are the provider's
      // own view (offline => zero marginal cost, ~instant). The router overwrites latencyMs.
      latencyMs: 0,
      cached: false,
      costUsd: 0,
    };
  }
}
