/**
 * @tryit/engine/providers/deterministic — the always-available terminal fallback provider.
 *
 * This provider NEVER fails and NEVER touches the network or environment. It derives a stable
 * fingerprint from the request (see ../internal/stable_request_hash.ts) and returns a
 * reproducible placeholder result: a renderable `data:image/svg+xml;base64,...` URL carrying the
 * deterministic SVG inline (see ./deterministic_placeholder_svg.ts). Identical requests therefore
 * yield a byte-identical {@link TryOnResult}, and because the image is inline it renders in a
 * browser with no host to resolve. It is both the offline/CI default and the router's guaranteed
 * last resort, so the engine can always answer fail-closed without hard-erroring.
 */

import type { TryOnRequest, TryOnResult } from '@tryit/contracts';
import type { ProviderContext, TryOnProvider } from '../provider.js';
import { stableRequestHash } from '../internal/stable_request_hash.js';
import { buildPlaceholderImageDataUrl } from './deterministic_placeholder_svg.js';

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
      resultImageUrl: buildPlaceholderImageDataUrl(digest),
      provider: this.id,
      // latency/cost are set authoritatively by the router; locals here are the provider's
      // own view (offline => zero marginal cost, ~instant). The router overwrites latencyMs.
      latencyMs: 0,
      cached: false,
      costUsd: 0,
    };
  }
}
