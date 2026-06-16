/**
 * Tests for the Replicate adapter with an INJECTED http client (no network). Asserts: input
 * mapping (human/garment/category/seed) and version, signal forwarding, string and string[]
 * output shapes, fail-closed on a non-succeeded status, on empty output, and a non-https url.
 */

import { describe, expect, it } from 'vitest';
import {
  ReplicateProvider,
  type ReplicateHttpClient,
  type ReplicatePrediction,
} from './replicate.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

function fakeClient(prediction: ReplicatePrediction): ReplicateHttpClient & {
  last?: { input: { version: string; input: Record<string, unknown> }; signal: AbortSignal };
} {
  const client: ReplicateHttpClient & {
    last?: { input: { version: string; input: Record<string, unknown> }; signal: AbortSignal };
  } = {
    async createPrediction(input, signal) {
      client.last = { input, signal };
      return prediction;
    },
  };
  return client;
}

describe('ReplicateProvider', () => {
  it('maps inputs and version, forwards the signal, returns the string output url', async () => {
    const client = fakeClient({ status: 'succeeded', output: 'https://replicate.delivery/r.png' });
    const provider = new ReplicateProvider({
      modelVersion: 'v-abc',
      httpClient: client,
      costPerCallUsd: 0.02,
    });
    const ctx = makeContext();
    const result = await provider.tryOn(
      makeRequest({
        productId: 'sku-3',
        params: { seed: 11, garmentImage: { kind: 'url', url: 'https://cdn.example.com/g.jpg' } },
      }),
      ctx,
    );

    expect(client.last?.input.version).toBe('v-abc');
    expect(client.last?.input.input).toEqual({
      human_img: 'https://cdn.example.com/person.jpg',
      garm_img: 'https://cdn.example.com/g.jpg',
      category: 'apparel',
      seed: 11,
    });
    expect(client.last?.signal).toBe(ctx.signal);
    expect(result.resultImageUrl).toBe('https://replicate.delivery/r.png');
    expect(result.costUsd).toBe(0.02);
  });

  it('resolves garment from productId and omits seed when none given', async () => {
    const client = fakeClient({ status: 'succeeded', output: 'https://replicate.delivery/r.png' });
    await new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(
      makeRequest({ productId: 'sku-x' }),
      makeContext(),
    );
    expect(client.last?.input.input).toEqual({
      human_img: 'https://cdn.example.com/person.jpg',
      garm_img: 'product:sku-x',
      category: 'apparel',
    });
  });

  it('reads the first element of an array output', async () => {
    const client = fakeClient({
      status: 'succeeded',
      output: ['https://replicate.delivery/a.png', 'https://replicate.delivery/b.png'],
    });
    const result = await new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(
      makeRequest(),
      makeContext(),
    );
    expect(result.resultImageUrl).toBe('https://replicate.delivery/a.png');
  });

  it('fails closed when the prediction did not succeed', async () => {
    const client = fakeClient({ status: 'failed', error: 'oom' });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(
        makeRequest(),
        makeContext(),
      ),
    ).rejects.toThrow(/status failed/);
  });

  it('fails closed when the output has no image url', async () => {
    const client = fakeClient({ status: 'succeeded', output: [] });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(
        makeRequest(),
        makeContext(),
      ),
    ).rejects.toThrow(/no image url/);
  });

  it('fails closed when the output url is not https', async () => {
    const client = fakeClient({ status: 'succeeded', output: 'http://replicate.delivery/r.png' });
    await expect(
      new ReplicateProvider({ modelVersion: 'v', httpClient: client }).tryOn(
        makeRequest(),
        makeContext(),
      ),
    ).rejects.toThrow(/malformed provider result/);
  });
});
