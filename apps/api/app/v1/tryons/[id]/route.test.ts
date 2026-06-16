/**
 * Integration tests for GET /v1/tryons/[id] — authenticated, tenant-scoped job retrieval.
 *
 * A real try-on is run to create a stored job, then fetched by its id WITH the owning tenant's
 * key (200). The fail-closed paths are exercised boundary-exactly: a missing bearer is 401; a
 * present-but-invalid bearer against an existing job is 404 (NOT 401 — anti-enumeration, so a
 * caller cannot confirm the job exists); an unknown id is 404; and the unknown-id 404 body is
 * byte-identical to the wrong-credential 404 body so existence is never revealed. Singletons reset
 * between tests so the jobs store starts empty.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET, OPTIONS } from './route';
import { POST } from '../route';
import {
  resetRuntime,
  demoApiKey,
  buildTryOnBody,
  buildPostRequest,
  buildGetRequest,
  buildOptionsRequest,
} from '../../../_lib/test-helpers';

beforeEach(() => {
  resetRuntime();
});

/** Helper: build the route params promise shape Next.js passes to the handler. */
function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Create a real succeeded job and return its id. */
async function createJob(): Promise<string> {
  const created = await POST(buildPostRequest(buildTryOnBody(), demoApiKey()));
  const job = (await created.json()) as { jobId: string };
  return job.jobId;
}

describe('GET /v1/tryons/[id] — authorised read', () => {
  it('returns the stored job for a known id with the owning tenant key (200)', async () => {
    const jobId = await createJob();
    const res = await GET(
      buildGetRequest(`https://api.test/v1/tryons/${jobId}`, demoApiKey()),
      params(jobId),
    );
    expect(res.status).toBe(200);
    const fetched = (await res.json()) as { jobId: string; status: string };
    expect(fetched.jobId).toBe(jobId);
    expect(fetched.status).toBe('succeeded');
  });
});

describe('GET /v1/tryons/[id] — fail-closed auth + anti-enumeration', () => {
  it('rejects a missing bearer token with 401 (before any lookup)', async () => {
    const jobId = await createJob();
    // No token at all -> 401, even though the job exists (credential gate fires first).
    const res = await GET(buildGetRequest(`https://api.test/v1/tryons/${jobId}`), params(jobId));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns 404 (NOT 401) for a present-but-invalid bearer against an existing job', async () => {
    const jobId = await createJob();
    // A present but wrong key passes the 401 gate, then fails authorisation -> 404, so a caller
    // cannot tell a real job from a fake one by probing with a junk key (anti-enumeration).
    const res = await GET(
      buildGetRequest(`https://api.test/v1/tryons/${jobId}`, 'not-a-real-key'),
      params(jobId),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
  });

  it('returns a typed 404 for an unknown id with a valid key (fail-closed miss)', async () => {
    const res = await GET(
      buildGetRequest('https://api.test/v1/tryons/does-not-exist', demoApiKey()),
      params('does-not-exist'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
  });

  it('serves a BYTE-IDENTICAL 404 body for a missing id and a wrong-credential read', async () => {
    const jobId = await createJob();
    const missing = await GET(
      buildGetRequest('https://api.test/v1/tryons/no-such-id', demoApiKey()),
      params('no-such-id'),
    );
    const wrongCred = await GET(
      buildGetRequest(`https://api.test/v1/tryons/${jobId}`, 'wrong-key'),
      params(jobId),
    );
    expect(missing.status).toBe(404);
    expect(wrongCred.status).toBe(404);
    // Identical body => existence of someone else's job is indistinguishable from absence.
    expect(await missing.text()).toBe(await wrongCred.text());
  });

  it('rejects a missing token even for an unknown id (401, not 404)', async () => {
    // The credential gate runs before the lookup, so a missing token is always 401.
    const res = await GET(
      buildGetRequest('https://api.test/v1/tryons/whatever'),
      params('whatever'),
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/tryons/[id] — CORS', () => {
  it('serves a CORS preflight (204)', async () => {
    const res = await OPTIONS(buildOptionsRequest('https://api.test/v1/tryons/x'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});
