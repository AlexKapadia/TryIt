/**
 * Tests for TryItClient.createTryOn and getJob — wire shape, parsing, and fail-closed behaviour.
 *
 * These assert the EXACT request that crosses the boundary (url/method/headers/body) and that
 * responses are validated against the contract before being returned. The fetch is injected and
 * capturing, so no network is touched and every byte sent is observable.
 */

import { describe, expect, it } from 'vitest';
import { ApiClientError, TryItClient } from './index.js';
import { makeCapturingFetch } from './test-support.js';
import { QUEUED_JOB, VALID_REQUEST, asBody } from './test-fixtures.js';

const BASE = 'https://api.tryit.example';
const KEY = 'sk-secret-123';

function client(script: Parameters<typeof makeCapturingFetch>[0]) {
  const cap = makeCapturingFetch(script);
  const c = new TryItClient({ apiKey: KEY, baseUrl: BASE, fetch: cap.fetch });
  return { c, cap };
}

describe('createTryOn', () => {
  it('sends POST to /v1/tryons with bearer auth, json content-type, and the validated body', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);

    const job = await c.createTryOn(VALID_REQUEST);

    expect(cap.calls).toHaveLength(1);
    const call = cap.calls[0]!;
    expect(call.url).toBe('https://api.tryit.example/v1/tryons');
    expect(call.method).toBe('POST');
    expect(call.headers['Authorization']).toBe('Bearer sk-secret-123');
    expect(call.headers['Content-Type']).toBe('application/json');
    // The body must be the contract-parsed request (category default applied), exactly.
    expect(JSON.parse(call.body!)).toEqual(VALID_REQUEST);
    expect(job).toEqual(QUEUED_JOB);
  });

  it('sends the idempotency-key header when a key is supplied (cost-control parity with widget)', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    await c.createTryOn(VALID_REQUEST, 'idem-123');
    const call = cap.calls[0]!;
    expect(call.headers['idempotency-key']).toBe('idem-123');
    // The bearer credential is still present and unchanged alongside the idempotency header.
    expect(call.headers['Authorization']).toBe('Bearer sk-secret-123');
  });

  it('omits the idempotency-key header when no key is supplied', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    await c.createTryOn(VALID_REQUEST);
    expect(cap.calls[0]!.headers['idempotency-key']).toBeUndefined();
  });

  it('treats a blank/whitespace idempotency key as absent (never indexes an empty key)', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    await c.createTryOn(VALID_REQUEST, '   ');
    expect(cap.calls[0]!.headers['idempotency-key']).toBeUndefined();
  });

  it('trims surrounding whitespace from a supplied idempotency key', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    await c.createTryOn(VALID_REQUEST, '  idem-trim  ');
    expect(cap.calls[0]!.headers['idempotency-key']).toBe('idem-trim');
  });

  it('applies the category default before sending when the caller omits it', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    // Cast: deliberately omit a defaulted field to prove the SDK fills it via the parser.
    const withoutCategory = {
      tenantId: 'tenant-1',
      shopperId: 'shopper-1',
      personImage: VALID_REQUEST.personImage,
      productId: 'product-1',
    } as unknown as typeof VALID_REQUEST;

    await c.createTryOn(withoutCategory);

    expect(JSON.parse(cap.calls[0]!.body!).category).toBe('apparel');
  });

  it('rejects an invalid request BEFORE any fetch (fail-closed) with INVALID_INPUT', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    const bad = { ...VALID_REQUEST, tenantId: '' };

    await expect(c.createTryOn(bad as typeof VALID_REQUEST)).rejects.toBeInstanceOf(ApiClientError);
    // The crucial assertion: the network was never touched.
    expect(cap.calls).toHaveLength(0);
  });

  it('rejects a request with an http (non-https) image url before fetch', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    const bad = {
      ...VALID_REQUEST,
      personImage: { kind: 'url' as const, url: 'http://images.example/p.jpg' },
    };

    await expect(c.createTryOn(bad)).rejects.toMatchObject({ code: 'INVALID_INPUT', httpStatus: 400 });
    expect(cap.calls).toHaveLength(0);
  });

  it('parses a 201 success body into a TryOnJob', async () => {
    const { c } = client([{ status: 201, body: asBody(QUEUED_JOB) }]);
    await expect(c.createTryOn(VALID_REQUEST)).resolves.toEqual(QUEUED_JOB);
  });

  it('fails closed when a 2xx body does not match the TryOnJob contract', async () => {
    const { c } = client([{ status: 200, body: asBody({ jobId: 'x', status: 'nope' }) }]);
    await expect(c.createTryOn(VALID_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('fails closed when a 2xx body is not valid JSON', async () => {
    const { c } = client([{ status: 200, body: 'not json {' }]);
    await expect(c.createTryOn(VALID_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});

describe('getJob', () => {
  it('sends GET to /v1/tryons/:id with bearer auth and no body', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);

    const job = await c.getJob('job-1');

    const call = cap.calls[0]!;
    expect(call.url).toBe('https://api.tryit.example/v1/tryons/job-1');
    expect(call.method).toBe('GET');
    expect(call.headers['Authorization']).toBe('Bearer sk-secret-123');
    expect(call.headers['Content-Type']).toBeUndefined();
    expect(call.body).toBeUndefined();
    expect(job).toEqual(QUEUED_JOB);
  });

  it('url-encodes a job id containing reserved characters', async () => {
    const { c, cap } = client([{ status: 200, body: asBody({ ...QUEUED_JOB, jobId: 'a/b 1' }) }]);
    await c.getJob('a/b 1');
    expect(cap.calls[0]!.url).toBe('https://api.tryit.example/v1/tryons/a%2Fb%201');
  });

  it('rejects an empty job id without touching the network (fail-closed)', async () => {
    const { c, cap } = client([{ status: 200, body: asBody(QUEUED_JOB) }]);
    await expect(c.getJob('')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(cap.calls).toHaveLength(0);
  });

  it('fails closed on an empty success body', async () => {
    const { c } = client([{ status: 200, body: '' }]);
    await expect(c.getJob('job-1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});
