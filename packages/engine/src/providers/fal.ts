/**
 * @tryit/engine/providers/fal — fal.ai hosted try-on adapter.
 *
 * Maps a {@link TryOnRequest} to a fal model input, invokes the model via an injected
 * {@link FalRunner} (a narrow `subscribe` surface over @fal-ai/client), and maps the fal
 * output back into a validated {@link TryOnResult}. The runner is INJECTED so tests pass a
 * fake and no network is ever touched in unit tests. In production the runner is built lazily
 * from `FAL_KEY`; fail-closed — if the key is absent when the real client is first needed, the
 * provider throws rather than issuing an unauthenticated request, and the router falls through.
 */

import { createRequire } from 'node:module';
import type { TryOnRequest, TryOnResult } from '@tryit/contracts';
import type { ProviderContext, TryOnProvider } from '../provider.js';
import { imageRefToInput } from '../internal/image_ref_to_input.js';
import { validateProviderResult } from '../internal/validate_provider_result.js';

/** The fal endpoint this adapter targets. A virtual try-on model id on fal.ai. */
export const FAL_TRYON_ENDPOINT = 'fal-ai/cat-vton';

/** The minimal input shape sent to the fal model. Mapped from the request, no extra fields. */
export interface FalTryOnInput {
  readonly human_image_url: string;
  readonly garment_image_url: string;
  readonly seed?: number;
  readonly num_samples: number;
}

/** The minimal output shape this adapter reads back from a fal result's `data`. */
export interface FalTryOnOutput {
  readonly image?: { readonly url?: unknown } | undefined;
  readonly images?: ReadonlyArray<{ readonly url?: unknown }> | undefined;
}

/** A fal result envelope, mirroring @fal-ai/client's `Result<T>` minimally. */
export interface FalRunResult<T> {
  readonly data: T;
  readonly requestId: string;
}

/**
 * The narrow fal surface this adapter depends on: a single `subscribe` call. Injecting this
 * (rather than the full @fal-ai/client) keeps the seam tiny and trivially fakeable in tests.
 */
export interface FalRunner {
  subscribe(
    endpointId: string,
    options: { input: FalTryOnInput; abortSignal?: AbortSignal | undefined },
  ): Promise<FalRunResult<FalTryOnOutput>>;
}

/** Options controlling how the FalProvider resolves its runner and cost. */
export interface FalProviderOptions {
  /** Injected runner; when omitted the provider lazily builds the real client from FAL_KEY. */
  readonly runner?: FalRunner | undefined;
  /** Factory for the real runner, overridable in tests; defaults to the @fal-ai/client build. */
  readonly runnerFactory?: (() => FalRunner) | undefined;
  /** Cost attributed per successful call, surfaced on the result for budget accounting. */
  readonly costPerCallUsd?: number | undefined;
  /** Endpoint override; defaults to {@link FAL_TRYON_ENDPOINT}. */
  readonly endpoint?: string | undefined;
}

/** Resolve the person and garment image inputs from a request. */
function mapInput(req: TryOnRequest): FalTryOnInput {
  const human = imageRefToInput(req.personImage);
  // A request may carry an explicit garment image; otherwise the product id is the garment ref.
  const garmentRef = req.params?.garmentImage;
  const garment = garmentRef ? imageRefToInput(garmentRef) : `product:${req.productId}`;
  const input: FalTryOnInput = {
    human_image_url: human,
    garment_image_url: garment,
    num_samples: req.params?.numSamples ?? 1,
  };
  // exactOptionalPropertyTypes: only attach `seed` when actually provided.
  return req.params?.seed === undefined ? input : { ...input, seed: req.params.seed };
}

/** Extract the first usable https image URL from a fal output, or fail closed. */
function extractImageUrl(out: FalTryOnOutput): string {
  const single = out.image?.url;
  if (typeof single === 'string' && single.length > 0) {
    return single;
  }
  const first = out.images?.[0]?.url;
  if (typeof first === 'string' && first.length > 0) {
    return first;
  }
  // fail-closed: no image in the upstream payload is an error, not an empty success.
  throw new Error('fal: response contained no image url');
}

export class FalProvider implements TryOnProvider {
  public readonly id = 'fal' as const;
  private runner: FalRunner | undefined;
  private readonly runnerFactory: () => FalRunner;
  private readonly costPerCallUsd: number;
  private readonly endpoint: string;

  public constructor(options: FalProviderOptions = {}) {
    this.runner = options.runner;
    this.runnerFactory = options.runnerFactory ?? defaultFalRunnerFactory;
    this.costPerCallUsd = options.costPerCallUsd ?? 0;
    this.endpoint = options.endpoint ?? FAL_TRYON_ENDPOINT;
  }

  /** Lazily resolve the runner; building the real client fails closed without FAL_KEY. */
  private resolveRunner(): FalRunner {
    if (this.runner) {
      return this.runner;
    }
    this.runner = this.runnerFactory();
    return this.runner;
  }

  public async tryOn(req: TryOnRequest, ctx: ProviderContext): Promise<TryOnResult> {
    const input = mapInput(req);
    const runner = this.resolveRunner();
    ctx.logger.debug('fal.tryOn', { endpoint: this.endpoint, tenantId: req.tenantId });
    const result = await runner.subscribe(this.endpoint, {
      input,
      abortSignal: ctx.signal,
    });
    const url = extractImageUrl(result.data);
    // Re-validate the mapped result against the contract (https-only url, non-negative cost).
    return validateProviderResult(
      {
        resultImageUrl: url,
        provider: this.id,
        latencyMs: 0,
        cached: false,
        costUsd: this.costPerCallUsd,
      },
      'fal',
    );
  }
}

/**
 * Default factory for the real fal runner, built lazily from `FAL_KEY`.
 *
 * fail-closed: with no credential we refuse rather than issuing an unauthenticated request.
 * Kept out of the hot path and isolated so unit tests (which inject a runner) never load it.
 */
export function defaultFalRunnerFactory(): FalRunner {
  const key = process.env['FAL_KEY'];
  if (!key || key.length === 0) {
    throw new Error('fal: FAL_KEY is not configured');
  }
  // Lazy require keeps @fal-ai/client (CommonJS) off the unit-test path entirely; tests inject
  // a fake runner and never reach this branch. createRequire is the ESM-safe way to load it.
  const require = createRequire(import.meta.url);
  const mod = require('@fal-ai/client') as {
    createFalClient: (cfg: { credentials: string }) => FalRunner;
  };
  return mod.createFalClient({ credentials: key });
}
