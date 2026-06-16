/**
 * Tests for the fal adapter with a FAKE runner (no network). Asserts: request mapping shape
 * (human/garment/seed/num_samples, endpoint), abort signal forwarding, both `image` and
 * `images[]` output shapes, fail-closed on empty output and on a non-https url, and that the
 * default real-runner factory fails closed without FAL_KEY (and never runs in these tests).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  FalProvider,
  FAL_TRYON_ENDPOINT,
  defaultFalRunnerFactory,
  type FalRunner,
  type FalTryOnInput,
  type FalTryOnOutput,
} from './fal.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

/** A fake runner capturing its inputs and returning a scripted output. No network. */
function fakeRunner(
  output: FalTryOnOutput,
): FalRunner & { last?: { endpoint: string; input: FalTryOnInput; signal?: AbortSignal } } {
  const runner: FalRunner & {
    last?: { endpoint: string; input: FalTryOnInput; signal?: AbortSignal };
  } = {
    async subscribe(endpointId, options) {
      runner.last = {
        endpoint: endpointId,
        input: options.input,
        ...(options.abortSignal ? { signal: options.abortSignal } : {}),
      };
      return { data: output, requestId: 'req-1' };
    },
  };
  return runner;
}

describe('FalProvider', () => {
  it('maps person/garment/seed/num_samples and targets the try-on endpoint', async () => {
    const runner = fakeRunner({ image: { url: 'https://cdn.fal.ai/out.png' } });
    const provider = new FalProvider({ runner, costPerCallUsd: 0.05 });
    const req = makeRequest({
      personImage: { kind: 'url', url: 'https://cdn.example.com/person.jpg' },
      params: {
        seed: 7,
        numSamples: 3,
        garmentImage: { kind: 'base64', mimeType: 'image/png', data: 'QUJD' },
      },
    });

    const result = await provider.tryOn(req, makeContext());

    expect(runner.last?.endpoint).toBe(FAL_TRYON_ENDPOINT);
    expect(runner.last?.input).toEqual({
      human_image_url: 'https://cdn.example.com/person.jpg',
      garment_image_url: 'data:image/png;base64,QUJD',
      seed: 7,
      num_samples: 3,
    });
    expect(result.resultImageUrl).toBe('https://cdn.fal.ai/out.png');
    expect(result.provider).toBe('fal');
    expect(result.costUsd).toBe(0.05);
  });

  it('defaults num_samples to 1 and resolves garment from productId when none supplied', async () => {
    const runner = fakeRunner({ image: { url: 'https://cdn.fal.ai/out.png' } });
    const provider = new FalProvider({ runner });
    await provider.tryOn(makeRequest({ productId: 'sku-9' }), makeContext());
    expect(runner.last?.input).toEqual({
      human_image_url: 'https://cdn.example.com/person.jpg',
      garment_image_url: 'product:sku-9',
      num_samples: 1,
    });
    // exactOptionalPropertyTypes: no `seed` key should be present when none was provided.
    expect('seed' in (runner.last?.input ?? {})).toBe(false);
  });

  it('forwards the context abort signal to the runner', async () => {
    const runner = fakeRunner({ image: { url: 'https://cdn.fal.ai/out.png' } });
    const provider = new FalProvider({ runner });
    const ctx = makeContext();
    await provider.tryOn(makeRequest(), ctx);
    expect(runner.last?.signal).toBe(ctx.signal);
  });

  it('reads the first url from an images[] array output', async () => {
    const runner = fakeRunner({
      images: [{ url: 'https://cdn.fal.ai/first.png' }, { url: 'https://cdn.fal.ai/second.png' }],
    });
    const result = await new FalProvider({ runner }).tryOn(makeRequest(), makeContext());
    expect(result.resultImageUrl).toBe('https://cdn.fal.ai/first.png');
  });

  it('fails closed when the output carries no image url', async () => {
    const runner = fakeRunner({});
    await expect(
      new FalProvider({ runner }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/no image url/);
  });

  it('fails closed when the upstream url is not https', async () => {
    const runner = fakeRunner({ image: { url: 'http://cdn.fal.ai/out.png' } });
    await expect(
      new FalProvider({ runner }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/malformed provider result/);
  });

  it('lazily builds the runner via the injected factory exactly once', async () => {
    const runner = fakeRunner({ image: { url: 'https://cdn.fal.ai/out.png' } });
    const factory = vi.fn(() => runner);
    const provider = new FalProvider({ runnerFactory: factory });
    await provider.tryOn(makeRequest(), makeContext());
    await provider.tryOn(makeRequest(), makeContext());
    expect(factory).toHaveBeenCalledTimes(1); // cached after first resolution.
  });

  it('default runner factory fails closed when FAL_KEY is absent', () => {
    const saved = process.env['FAL_KEY'];
    delete process.env['FAL_KEY'];
    try {
      expect(() => defaultFalRunnerFactory()).toThrow(/FAL_KEY is not configured/);
    } finally {
      if (saved !== undefined) {
        process.env['FAL_KEY'] = saved;
      }
    }
  });
});
