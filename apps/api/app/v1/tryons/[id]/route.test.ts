/**
 * Integration tests for GET /v1/tryons/[id] — job retrieval by id.
 *
 * A real try-on is run to create a stored job, then fetched by its id (200), and an unknown id is
 * fetched to prove the typed 404 miss path (fail-closed: never a fabricated 200). Singletons reset
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

describe('GET /v1/tryons/[id]', () => {
  it('returns the stored job for a known id (200)', async () => {
    const created = await POST(buildPostRequest(buildTryOnBody(), demoApiKey()));
    const job = (await created.json()) as { jobId: string };

    const res = await GET(buildGetRequest(`https://api.test/v1/tryons/${job.jobId}`), params(job.jobId));
    expect(res.status).toBe(200);
    const fetched = (await res.json()) as { jobId: string; status: string };
    expect(fetched.jobId).toBe(job.jobId);
    expect(fetched.status).toBe('succeeded');
  });

  it('returns a typed 404 for an unknown id (fail-closed miss)', async () => {
    const res = await GET(buildGetRequest('https://api.test/v1/tryons/does-not-exist'), params('does-not-exist'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('serves a CORS preflight (204)', async () => {
    const res = await OPTIONS(buildOptionsRequest('https://api.test/v1/tryons/x'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});
