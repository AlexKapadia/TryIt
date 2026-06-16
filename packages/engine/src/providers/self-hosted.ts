/**
 * @tryit/engine/providers/self-hosted — adapter for the self-hosted inference-py service.
 *
 * POSTs a mapped {@link TryOnRequest} to the inference service's `/infer` endpoint over an
 * INJECTED `fetch`, then maps the JSON response into a validated {@link TryOnResult}. The fetch
 * is injected so unit tests provide a fixture responder and no network is touched. The call is
 * timeout-aware via the context's {@link AbortSignal}; a non-2xx status, a malformed body, or a
 * missing image URL all fail closed (throw) so the router falls through to the next provider.
 */

import type { TryOnRequest, TryOnResult } from '@tryit/contracts';
import type { ProviderContext, TryOnProvider } from '../provider.js';
import { imageRefToInput } from '../internal/image_ref_to_input.js';
import { validateProviderResult } from '../internal/validate_provider_result.js';

/** The minimal `fetch` surface the adapter needs, so any injected stub satisfies it. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal | undefined;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Request body POSTed to the inference service. */
interface InferRequestBody {
  readonly person_image: string;
  readonly product_id: string;
  readonly category: string;
  readonly seed?: number;
  readonly num_samples: number;
}

/** Options for the self-hosted adapter. */
export interface SelfHostedProviderOptions {
  /** Base URL of the inference-py service, e.g. `https://infer.internal`. Required. */
  readonly baseUrl: string;
  /** Injected fetch implementation. Required so no global fetch is ever used implicitly. */
  readonly fetchImpl: FetchLike;
  /** Cost attributed per successful call. */
  readonly costPerCallUsd?: number | undefined;
}

/** Map the request into the inference service body. */
function mapBody(req: TryOnRequest): InferRequestBody {
  const base: InferRequestBody = {
    person_image: imageRefToInput(req.personImage),
    product_id: req.productId,
    category: req.category,
    num_samples: req.params?.numSamples ?? 1,
  };
  return req.params?.seed === undefined ? base : { ...base, seed: req.params.seed };
}

export class SelfHostedProvider implements TryOnProvider {
  public readonly id = 'self-hosted' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly costPerCallUsd: number;

  public constructor(options: SelfHostedProviderOptions) {
    // Strip a trailing slash so the joined path is well-formed regardless of caller input.
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl;
    this.costPerCallUsd = options.costPerCallUsd ?? 0;
  }

  public async tryOn(req: TryOnRequest, ctx: ProviderContext): Promise<TryOnResult> {
    const body = mapBody(req);
    ctx.logger.debug('selfHosted.tryOn', { baseUrl: this.baseUrl, tenantId: req.tenantId });
    const response = await this.fetchImpl(`${this.baseUrl}/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
    if (!response.ok) {
      // fail-closed: a non-2xx upstream status is a failure, not a degraded success.
      throw new Error(`self-hosted: inference service returned status ${response.status}`);
    }
    const payload = (await response.json()) as { image_url?: unknown };
    const url = payload.image_url;
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('self-hosted: response missing image_url');
    }
    return validateProviderResult(
      {
        resultImageUrl: url,
        provider: this.id,
        latencyMs: 0,
        cached: false,
        costUsd: this.costPerCallUsd,
      },
      'self-hosted',
    );
  }
}
