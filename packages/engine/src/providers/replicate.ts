/**
 * @tryit/engine/providers/replicate — Replicate hosted try-on adapter (config-gated).
 *
 * Maps a {@link TryOnRequest} into a Replicate prediction `input`, runs it through an INJECTED
 * HTTP client, and maps the prediction `output` back into a validated {@link TryOnResult}. The
 * client is injected so unit tests supply a fixture and no network is touched. This adapter is
 * only wired in when the tenant config allow-lists `replicate`; fail-closed mapping rejects a
 * failed prediction or an output with no usable image url so the router falls through.
 */

import type { TryOnRequest, TryOnResult } from '@tryit/contracts';
import type { ProviderContext, TryOnProvider } from '../provider.js';
import { imageRefToInput } from '../internal/image_ref_to_input.js';
import { validateProviderResult } from '../internal/validate_provider_result.js';

/** A Replicate prediction response, narrowed to the fields this adapter reads. */
export interface ReplicatePrediction {
  readonly status: string;
  readonly output?: unknown;
  readonly error?: unknown;
}

/** The injected HTTP client: create a prediction and resolve it to a terminal state. */
export interface ReplicateHttpClient {
  createPrediction(
    input: { version: string; input: Record<string, unknown> },
    signal: AbortSignal,
  ): Promise<ReplicatePrediction>;
}

/** Options for the Replicate adapter. */
export interface ReplicateProviderOptions {
  /** The model version hash to run. Required and config-supplied. */
  readonly modelVersion: string;
  /** Injected HTTP client. Required so no network client is constructed implicitly. */
  readonly httpClient: ReplicateHttpClient;
  /** Cost attributed per successful call. */
  readonly costPerCallUsd?: number | undefined;
}

/** Pull the first usable https image url out of a Replicate `output` (string or string[]). */
function extractOutputUrl(output: unknown): string {
  if (typeof output === 'string' && output.length > 0) {
    return output;
  }
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === 'string' && first.length > 0) {
      return first;
    }
  }
  // fail-closed: an output we cannot read as an image url is an error, not an empty success.
  throw new Error('replicate: prediction output contained no image url');
}

export class ReplicateProvider implements TryOnProvider {
  public readonly id = 'replicate' as const;
  private readonly modelVersion: string;
  private readonly httpClient: ReplicateHttpClient;
  private readonly costPerCallUsd: number;

  public constructor(options: ReplicateProviderOptions) {
    this.modelVersion = options.modelVersion;
    this.httpClient = options.httpClient;
    this.costPerCallUsd = options.costPerCallUsd ?? 0;
  }

  public async tryOn(req: TryOnRequest, ctx: ProviderContext): Promise<TryOnResult> {
    const garmentRef = req.params?.garmentImage;
    const input: Record<string, unknown> = {
      human_img: imageRefToInput(req.personImage),
      garm_img: garmentRef ? imageRefToInput(garmentRef) : `product:${req.productId}`,
      category: req.category,
    };
    if (req.params?.seed !== undefined) {
      input['seed'] = req.params.seed;
    }
    ctx.logger.debug('replicate.tryOn', { version: this.modelVersion, tenantId: req.tenantId });
    const prediction = await this.httpClient.createPrediction(
      { version: this.modelVersion, input },
      ctx.signal,
    );
    if (prediction.status !== 'succeeded') {
      // fail-closed: any non-succeeded terminal state is a failure for the router to handle.
      throw new Error(`replicate: prediction status ${prediction.status}`);
    }
    const url = extractOutputUrl(prediction.output);
    return validateProviderResult(
      {
        resultImageUrl: url,
        provider: this.id,
        latencyMs: 0,
        cached: false,
        costUsd: this.costPerCallUsd,
      },
      'replicate',
    );
  }
}
