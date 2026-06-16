/**
 * Integration tests for GET /v1/dev/credentials — the dev-only credential exposure gate.
 *
 * In a non-production environment it returns the seeded demo `{ tenantId, apiKey }`, and the
 * returned key actually works against the try-on pipeline (proving it is a real, usable key). When
 * `NODE_ENV=production` (without the explicit opt-in) it returns 404 and reveals nothing —
 * fail-closed so a credential can never escape a production process.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from './route';
import { POST } from '../../tryons/route';
import {
  resetRuntime,
  buildTryOnBody,
  buildPostRequest,
  buildGetRequest,
  DEMO_TENANT,
} from '../../../_lib/test-helpers';

beforeEach(() => {
  resetRuntime();
});
afterEach(() => {
  // Restore any stubbed env so one test cannot leak its override into another.
  vi.unstubAllEnvs();
});

describe('GET /v1/dev/credentials', () => {
  it('returns the demo tenantId + a working apiKey in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await GET(buildGetRequest('https://api.test/v1/dev/credentials'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: string; apiKey: string };
    expect(body.tenantId).toBe(DEMO_TENANT);
    expect(typeof body.apiKey).toBe('string');
    expect(body.apiKey.length).toBeGreaterThan(0);

    // The handed-out key must actually authenticate a real try-on request.
    const tryon = await POST(buildPostRequest(buildTryOnBody(), body.apiKey));
    expect(tryon.status).toBe(200);
  });

  it('returns 404 in production without the explicit opt-in (fail-closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRYIT_DEV_DEMO', '');
    const res = await GET(buildGetRequest('https://api.test/v1/dev/credentials'));
    expect(res.status).toBe(404);
    // The body must not contain an apiKey field.
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.apiKey).toBeUndefined();
  });

  it('exposes credentials in production ONLY with the explicit TRYIT_DEV_DEMO opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRYIT_DEV_DEMO', '1');
    const res = await GET(buildGetRequest('https://api.test/v1/dev/credentials'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { apiKey: string }).apiKey.length).toBeGreaterThan(0);
  });
});
