/**
 * Tests for the self-hosted adapter with an INJECTED fetch (no network). Asserts: POST to
 * /infer with the mapped body and forwarded signal, trailing-slash base-url normalisation,
 * fail-closed on non-2xx status, on a missing image_url, and on a non-https returned url.
 */

import { describe, expect, it } from 'vitest';
import { SelfHostedProvider, type FetchLike } from './self-hosted.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

/** Build a fake fetch that records its call and returns a scripted response. */
function fakeFetch(
  response: { ok: boolean; status: number; body: unknown },
): FetchLike & { last?: Parameters<FetchLike> } {
  const fn = (async (input, init) => {
    (fn as { last?: Parameters<FetchLike> }).last = [input, init];
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    };
  }) as FetchLike & { last?: Parameters<FetchLike> };
  return fn;
}

describe('SelfHostedProvider', () => {
  it('POSTs the mapped body to /infer and forwards the abort signal', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      body: { image_url: 'https://infer.example.com/r.png' },
    });
    const provider = new SelfHostedProvider({
      baseUrl: 'https://infer.example.com',
      fetchImpl,
      costPerCallUsd: 0.01,
    });
    const ctx = makeContext();
    const result = await provider.tryOn(
      makeRequest({ productId: 'sku-7', params: { seed: 3, numSamples: 2 } }),
      ctx,
    );

    const [url, init] = fetchImpl.last!;
    expect(url).toBe('https://infer.example.com/infer');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.signal).toBe(ctx.signal);
    expect(JSON.parse(init.body)).toEqual({
      person_image: 'https://cdn.example.com/person.jpg',
      product_id: 'sku-7',
      category: 'apparel',
      seed: 3,
      num_samples: 2,
    });
    expect(result.resultImageUrl).toBe('https://infer.example.com/r.png');
    expect(result.costUsd).toBe(0.01);
  });

  it('normalises a trailing slash on the base url', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      body: { image_url: 'https://infer.example.com/r.png' },
    });
    const provider = new SelfHostedProvider({ baseUrl: 'https://infer.example.com///', fetchImpl });
    await provider.tryOn(makeRequest(), makeContext());
    expect(fetchImpl.last![0]).toBe('https://infer.example.com/infer');
  });

  it('omits seed when the request supplies none', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      body: { image_url: 'https://infer.example.com/r.png' },
    });
    await new SelfHostedProvider({ baseUrl: 'https://infer.example.com', fetchImpl }).tryOn(
      makeRequest(),
      makeContext(),
    );
    expect('seed' in JSON.parse(fetchImpl.last![1].body)).toBe(false);
  });

  it('fails closed on a non-2xx status', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 503, body: {} });
    await expect(
      new SelfHostedProvider({ baseUrl: 'https://infer.example.com', fetchImpl }).tryOn(
        makeRequest(),
        makeContext(),
      ),
    ).rejects.toThrow(/status 503/);
  });

  it('fails closed when the response is missing image_url', async () => {
    const fetchImpl = fakeFetch({ ok: true, status: 200, body: { other: 1 } });
    await expect(
      new SelfHostedProvider({ baseUrl: 'https://infer.example.com', fetchImpl }).tryOn(
        makeRequest(),
        makeContext(),
      ),
    ).rejects.toThrow(/missing image_url/);
  });

  it('fails closed when the returned url is not https', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      body: { image_url: 'http://infer.example.com/r.png' },
    });
    await expect(
      new SelfHostedProvider({ baseUrl: 'https://infer.example.com', fetchImpl }).tryOn(
        makeRequest(),
        makeContext(),
      ),
    ).rejects.toThrow(/malformed provider result/);
  });
});
