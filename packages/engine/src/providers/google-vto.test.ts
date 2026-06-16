/**
 * Tests for the Google VTO adapter with an INJECTED http client (no network). Asserts: the
 * :predict instance/parameters mapping (person + product image, sampleCount, seed), signal
 * forwarding, fail-closed on no predictions / missing url, and on a non-https url.
 */

import { describe, expect, it } from 'vitest';
import {
  GoogleVtoProvider,
  type GoogleVtoHttpClient,
  type GoogleVtoResponse,
} from './google-vto.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

function fakeClient(response: GoogleVtoResponse): GoogleVtoHttpClient & {
  last?: {
    request: { instances: ReadonlyArray<Record<string, unknown>>; parameters: Record<string, unknown> };
    signal: AbortSignal;
  };
} {
  const client: GoogleVtoHttpClient & {
    last?: {
      request: {
        instances: ReadonlyArray<Record<string, unknown>>;
        parameters: Record<string, unknown>;
      };
      signal: AbortSignal;
    };
  } = {
    async predict(request, signal) {
      client.last = { request, signal };
      return response;
    },
  };
  return client;
}

describe('GoogleVtoProvider', () => {
  it('maps the instance and parameters and forwards the signal', async () => {
    const client = fakeClient({
      predictions: [{ resultImageUrl: 'https://storage.googleapis.com/r.png' }],
    });
    const provider = new GoogleVtoProvider({ httpClient: client, costPerCallUsd: 0.04 });
    const ctx = makeContext();
    const result = await provider.tryOn(
      makeRequest({ productId: 'sku-2', params: { seed: 5, numSamples: 2 } }),
      ctx,
    );

    expect(client.last?.request.instances).toEqual([
      {
        personImage: { image: { gcsUri: 'https://cdn.example.com/person.jpg' } },
        productImages: [{ image: { productId: 'sku-2' } }],
      },
    ]);
    expect(client.last?.request.parameters).toEqual({ sampleCount: 2, seed: 5 });
    expect(client.last?.signal).toBe(ctx.signal);
    expect(result.resultImageUrl).toBe('https://storage.googleapis.com/r.png');
    expect(result.costUsd).toBe(0.04);
  });

  it('uses an explicit garment image and defaults sampleCount, omitting seed', async () => {
    const client = fakeClient({
      predictions: [{ resultImageUrl: 'https://storage.googleapis.com/r.png' }],
    });
    await new GoogleVtoProvider({ httpClient: client }).tryOn(
      makeRequest({
        params: { garmentImage: { kind: 'url', url: 'https://cdn.example.com/g.jpg' } },
      }),
      makeContext(),
    );
    const instance = client.last!.request.instances[0] as { productImages: unknown };
    expect(instance.productImages).toEqual([
      { image: { gcsUri: 'https://cdn.example.com/g.jpg' } },
    ]);
    expect(client.last!.request.parameters).toEqual({ sampleCount: 1 });
  });

  it('fails closed when there are no predictions', async () => {
    const client = fakeClient({ predictions: [] });
    await expect(
      new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/no result image url/);
  });

  it('fails closed when the prediction lacks a result url', async () => {
    const client = fakeClient({ predictions: [{}] });
    await expect(
      new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/no result image url/);
  });

  it('fails closed when the result url is not https', async () => {
    const client = fakeClient({
      predictions: [{ resultImageUrl: 'http://storage.googleapis.com/r.png' }],
    });
    await expect(
      new GoogleVtoProvider({ httpClient: client }).tryOn(makeRequest(), makeContext()),
    ).rejects.toThrow(/malformed provider result/);
  });
});
