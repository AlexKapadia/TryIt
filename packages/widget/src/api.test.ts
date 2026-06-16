/**
 * Tests for the browser API client. fetch is injected (NO network) and every response shape is
 * exercised: valid job, malformed 2xx body, typed error body, untyped error body, non-JSON body,
 * and a thrown network error — all must resolve to a typed ApiResult, never an unhandled reject.
 */

import { describe, it, expect, vi } from 'vitest';
import { createApiClient, type FetchLike, type ApiClientConfig } from './api.js';
import type { TryOnRequest, TryOnJob } from '@tryit/contracts';

const request: TryOnRequest = {
  tenantId: 't1',
  shopperId: 's1',
  personImage: { kind: 'url', url: 'https://img/person.jpg' },
  productId: 'p1',
  category: 'apparel',
};

const validJob: TryOnJob = {
  jobId: 'job-1',
  status: 'queued',
  request,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Build a fetch fake returning a given status + JSON body, recording the call. */
function fakeFetch(status: number, body: unknown): FetchLike {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

function client(fetchImpl: FetchLike): ReturnType<typeof createApiClient> {
  const config: ApiClientConfig = {
    baseUrl: 'https://api.tryit.test/',
    publishableKey: 'pk_test_123',
    fetch: fetchImpl,
  };
  return createApiClient(config);
}

describe('createTryOn', () => {
  it('returns the parsed job on a 200 with a valid body', async () => {
    const r = await client(fakeFetch(200, validJob)).createTryOn(request);
    expect(r).toEqual({ ok: true, value: validJob });
  });

  it('sends bearer auth, JSON content-type, and the idempotency-key header', async () => {
    const fetchMock = fakeFetch(200, validJob) as ReturnType<typeof vi.fn>;
    await client(fetchMock).createTryOn(request, 'idem-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    // No doubled slash despite baseUrl trailing slash.
    expect(url).toBe('https://api.tryit.test/v1/tryons');
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer pk_test_123');
    expect(headers['content-type']).toBe('application/json');
    expect(headers['idempotency-key']).toBe('idem-1');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toMatchObject({ tenantId: 't1' });
  });

  it('omits the idempotency-key header when none is given', async () => {
    const fetchMock = fakeFetch(200, validJob) as ReturnType<typeof vi.fn>;
    await client(fetchMock).createTryOn(request);
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeUndefined();
  });

  it('maps a typed error body to its code', async () => {
    const r = await client(
      fakeFetch(429, { code: 'RATE_LIMITED', message: 'slow down', httpStatus: 429 }),
    ).createTryOn(request);
    expect(r).toEqual({ ok: false, code: 'RATE_LIMITED' });
  });

  it('fails closed to PROVIDER_ERROR on a 2xx with a malformed job body', async () => {
    const r = await client(fakeFetch(200, { jobId: '', status: 'nope' })).createTryOn(request);
    expect(r).toEqual({ ok: false, code: 'PROVIDER_ERROR' });
  });

  it('fails closed to PROVIDER_ERROR on a non-2xx with an unrecognised error body', async () => {
    const r = await client(fakeFetch(500, { oops: true })).createTryOn(request);
    expect(r).toEqual({ ok: false, code: 'PROVIDER_ERROR' });
  });

  it('fails closed to PROVIDER_ERROR on a non-JSON body', async () => {
    const f: FetchLike = async () => new Response('<html>nope', { status: 200 });
    expect(await client(f).createTryOn(request)).toEqual({ ok: false, code: 'PROVIDER_ERROR' });
  });

  it('fails closed to PROVIDER_ERROR when fetch itself throws (network/CORS)', async () => {
    const f: FetchLike = async () => {
      throw new Error('network down');
    };
    expect(await client(f).createTryOn(request)).toEqual({ ok: false, code: 'PROVIDER_ERROR' });
  });
});

describe('getJob', () => {
  it('GETs the encoded job path and returns the parsed job', async () => {
    const fetchMock = fakeFetch(200, validJob) as ReturnType<typeof vi.fn>;
    const r = await client(fetchMock).getJob('job/../x');
    expect(r).toEqual({ ok: true, value: validJob });
    const [url, init] = fetchMock.mock.calls[0]!;
    // Path traversal in the id is percent-encoded, never interpolated raw.
    expect(url).toBe('https://api.tryit.test/v1/tryons/job%2F..%2Fx');
    expect(init!.method).toBe('GET');
  });

  it('sends bearer auth on getJob so polling works against the authenticated read endpoint', async () => {
    const fetchMock = fakeFetch(200, validJob) as ReturnType<typeof vi.fn>;
    await client(fetchMock).getJob('job-1');
    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    // The now-authenticated GET /v1/tryons/:id requires the bearer key on every poll.
    expect(headers.authorization).toBe('Bearer pk_test_123');
    expect(init.method).toBe('GET');
  });

  it('propagates a typed error code from getJob', async () => {
    const r = await client(
      fakeFetch(401, { code: 'UNAUTHORIZED', message: 'no', httpStatus: 401 }),
    ).getJob('job-1');
    expect(r).toEqual({ ok: false, code: 'UNAUTHORIZED' });
  });

  it('does not call fetch at construction time (no implicit network)', () => {
    const fetchMock = vi.fn();
    createApiClient({ baseUrl: 'https://x', publishableKey: 'pk', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('joins a baseUrl WITHOUT a trailing slash correctly (no missing/doubled slash)', async () => {
    const fetchMock = fakeFetch(200, validJob) as ReturnType<typeof vi.fn>;
    const c = createApiClient({
      baseUrl: 'https://api.tryit.test',
      publishableKey: 'pk',
      fetch: fetchMock,
    });
    await c.getJob('job-1');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.tryit.test/v1/tryons/job-1');
  });
});
