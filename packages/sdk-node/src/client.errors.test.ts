/**
 * Tests for TryItClient error translation, construction guards, and credential safety.
 *
 * Covers: 4xx/5xx bodies mapped to typed ApiClientError with the right code/status; malformed or
 * empty error bodies failing closed to PROVIDER_ERROR; transport-layer throws becoming typed
 * errors; constructor guards; baseUrl normalisation; and the security invariant that the API key
 * never appears in any thrown error's message or serialisation.
 */

import { describe, expect, it } from 'vitest';
import { makeApiError } from '@tryit/contracts';
import { ApiClientError, TryItClient, failClosedError } from './index.js';
import { makeCapturingFetch } from './test-support.js';
import { QUEUED_JOB, VALID_REQUEST, asBody } from './test-fixtures.js';

const BASE = 'https://api.tryit.example';
const KEY = 'sk-super-secret-DO-NOT-LEAK';

function client(script: Parameters<typeof makeCapturingFetch>[0]) {
  const cap = makeCapturingFetch(script);
  const c = new TryItClient({ apiKey: KEY, baseUrl: BASE, fetch: cap.fetch });
  return { c, cap };
}

describe('non-2xx -> typed ApiClientError', () => {
  // Boundary-exact: every code in the contract maps to its declared status and is thrown intact.
  const cases = [
    { code: 'UNAUTHORIZED' as const, status: 401 },
    { code: 'INVALID_INPUT' as const, status: 400 },
    { code: 'PAYLOAD_TOO_LARGE' as const, status: 413 },
    { code: 'RATE_LIMITED' as const, status: 429 },
    { code: 'BUDGET_EXCEEDED' as const, status: 402 },
    { code: 'KILL_SWITCH_ENGAGED' as const, status: 503 },
    { code: 'PROVIDER_ERROR' as const, status: 502 },
  ];

  for (const { code, status } of cases) {
    it(`maps a ${status} ${code} body to ApiClientError.code=${code}`, async () => {
      const apiError = makeApiError(code, `failed: ${code}`);
      const { c } = client([{ status, body: asBody(apiError) }]);

      const err = await c.getJob('job-1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).code).toBe(code);
      expect((err as ApiClientError).httpStatus).toBe(apiError.httpStatus);
      expect((err as ApiClientError).message).toBe(`failed: ${code}`);
    });
  }

  it('uses the httpStatus from the BODY, not the transport status, when they disagree', async () => {
    // Server returns transport 500 but a body declaring a 401 UNAUTHORIZED contract error.
    const apiError = makeApiError('UNAUTHORIZED', 'bad key');
    const { c } = client([{ status: 500, body: asBody(apiError) }]);
    const err = (await c.getJob('job-1').catch((e: unknown) => e)) as ApiClientError;
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.httpStatus).toBe(401);
  });

  it('fails closed (PROVIDER_ERROR) when a non-2xx body is not the ApiError contract', async () => {
    const { c } = client([{ status: 500, body: asBody({ message: 'oops', random: true }) }]);
    await expect(c.getJob('job-1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR', httpStatus: 502 });
  });

  it('fails closed when a non-2xx body is not valid JSON', async () => {
    const { c } = client([{ status: 503, body: '<html>gateway</html>' }]);
    await expect(c.getJob('job-1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('fails closed when a non-2xx body is empty', async () => {
    const { c } = client([{ status: 502, body: '' }]);
    await expect(c.getJob('job-1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});

describe('transport failures fail closed', () => {
  it('translates a transport throw into a typed PROVIDER_ERROR', async () => {
    const { c } = client([{ throwTransport: 'ECONNRESET' }]);
    const err = (await c.getJob('job-1').catch((e: unknown) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('PROVIDER_ERROR');
  });

  it('translates a body-read failure into a typed PROVIDER_ERROR', async () => {
    const { c } = client([{ throwOnRead: 'stream aborted' }]);
    await expect(c.getJob('job-1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});

describe('constructor guards (fail-closed)', () => {
  it('refuses an empty apiKey', () => {
    expect(() => new TryItClient({ apiKey: '', baseUrl: BASE })).toThrow(ApiClientError);
  });
  it('refuses an empty baseUrl', () => {
    expect(() => new TryItClient({ apiKey: KEY, baseUrl: '' })).toThrow(ApiClientError);
  });
});

describe('constructor defaults (no injection)', () => {
  it('defaults now/sleep/fetch yet still short-circuits invalid input before any network call', async () => {
    // No fetch/now/sleep injected: exercises the `?? globalThis.fetch` / `?? Date.now` defaults.
    // The invalid request fails closed BEFORE fetch, so the default fetch is never invoked —
    // proving the defaults are wired without requiring a real network.
    const c = new TryItClient({ apiKey: KEY, baseUrl: BASE });
    await expect(c.createTryOn({ ...VALID_REQUEST, tenantId: '' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(c.getJob('')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      c.waitForJob('job-1', { pollMs: 0, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('baseUrl normalisation', () => {
  it('strips trailing slashes so paths never double up', async () => {
    const cap = makeCapturingFetch([{ status: 200, body: asBody(QUEUED_JOB) }]);
    const c = new TryItClient({ apiKey: KEY, baseUrl: 'https://api.tryit.example///', fetch: cap.fetch });
    await c.getJob('job-1');
    expect(cap.calls[0]!.url).toBe('https://api.tryit.example/v1/tryons/job-1');
  });
});

describe('credential safety — the api key never leaks into errors', () => {
  it('keeps the key out of a transport-failure error', async () => {
    const { c } = client([{ throwTransport: 'boom' }]);
    const err = (await c.getJob('job-1').catch((e: unknown) => e)) as ApiClientError;
    expect(err.message).not.toContain(KEY);
    expect(JSON.stringify(err.apiError)).not.toContain(KEY);
  });

  it('keeps the key out of a fail-closed parse error', async () => {
    const { c } = client([{ status: 200, body: 'garbage' }]);
    const err = (await c.createTryOn(VALID_REQUEST).catch((e: unknown) => e)) as ApiClientError;
    expect(err.message).not.toContain(KEY);
  });

  it('failClosedError preserves PROVIDER_ERROR and is an ApiClientError', () => {
    const err = failClosedError('something opaque');
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.httpStatus).toBe(502);
    expect(err.message).toBe('something opaque');
  });
});
