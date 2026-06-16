/**
 * Integration tests for POST /v1/tryons — the try-on pipeline exercised in-process.
 *
 * Each test constructs a real Web `Request`, calls the exported route handler, and asserts on the
 * Response status + body and on the audit trail. The deterministic provider is the offline
 * default so the happy path makes no network call. Singletons are reset before each test for
 * isolation. Assertions are boundary-exact and adversarial — they would fail if a gate were
 * skipped, mis-ordered, or fail-open.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST, OPTIONS } from './route';
import { getRuntime } from '../../_lib/runtime';
import {
  resetRuntime,
  demoApiKey,
  buildTryOnBody,
  buildPostRequest,
  buildOptionsRequest,
  OVERSIZE_DIMENSIONS_PNG_BASE64,
  DEMO_TENANT,
} from '../../_lib/test-helpers';

beforeEach(() => {
  resetRuntime();
  delete process.env.TRYIT_KILL_SWITCH;
});
afterEach(() => {
  delete process.env.TRYIT_KILL_SWITCH;
});

describe('POST /v1/tryons — happy path', () => {
  it('returns a succeeded job with a deterministic result and writes an allow audit event', async () => {
    const res = await POST(buildPostRequest(buildTryOnBody(), demoApiKey()));
    expect(res.status).toBe(200);
    const job = (await res.json()) as Record<string, unknown>;
    expect(job.status).toBe('succeeded');
    const result = job.result as Record<string, unknown>;
    expect(result.provider).toBe('deterministic');
    expect(result.cached).toBe(false);
    expect(typeof result.resultImageUrl).toBe('string');
    // The offline DeterministicProvider returns a renderable inline image data URL (not a fake
    // non-resolvable host), so the result image actually renders in a browser.
    expect(result.resultImageUrl as string).toMatch(/^data:image\/svg\+xml;base64,/);

    const audit = getRuntime().auditSink.list();
    const allow = audit.filter((e) => e.outcome === 'allow');
    expect(allow).toHaveLength(1);
    expect(allow[0]!.action).toBe('tryon');
    expect(allow[0]!.tenantId).toBe(DEMO_TENANT);
    // The actor is the shopper id, never the api key (no secret in the trail).
    expect(allow[0]!.actor).toBe('shopper-1');
  });

  it('persists the job so it is retrievable by id', async () => {
    const res = await POST(buildPostRequest(buildTryOnBody(), demoApiKey()));
    const job = (await res.json()) as { jobId: string };
    expect(getRuntime().jobs.get(job.jobId)?.status).toBe('succeeded');
  });
});

describe('POST /v1/tryons — auth (fail-closed)', () => {
  it('rejects a missing bearer token with 401 and writes no allow event', async () => {
    const res = await POST(buildPostRequest(buildTryOnBody(), undefined));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
    // No allow audit event was written for an unauthenticated request.
    expect(getRuntime().auditSink.list().some((e) => e.outcome === 'allow')).toBe(false);
  });

  it('rejects a wrong/garbage bearer token with 401', async () => {
    const res = await POST(buildPostRequest(buildTryOnBody(), 'not-a-real-key'));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('rejects a valid key used against a different tenant (tenant isolation) with 401', async () => {
    // The demo key is scoped to demo-tenant; presenting it for another tenant must be refused.
    const body = buildTryOnBody({ tenantId: 'other-tenant' });
    const res = await POST(buildPostRequest(body, demoApiKey()));
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/tryons — kill switch (503)', () => {
  it('refuses when the global env kill switch is engaged', async () => {
    process.env.TRYIT_KILL_SWITCH = '1';
    const res = await POST(buildPostRequest(buildTryOnBody(), demoApiKey()));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('KILL_SWITCH_ENGAGED');
    // The kill switch denies AFTER auth, so a deny event is recorded, never an allow.
    const audit = getRuntime().auditSink.list();
    expect(audit.some((e) => e.outcome === 'allow')).toBe(false);
    expect(audit.some((e) => e.outcome === 'deny')).toBe(true);
  });
});

describe('POST /v1/tryons — invalid input', () => {
  it('rejects a malformed JSON body with 400', async () => {
    const req = new Request('https://api.test/v1/tryons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demoApiKey()}` },
      body: '{ not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('INVALID_INPUT');
  });

  it('rejects a body that fails schema validation with 400', async () => {
    const res = await POST(buildPostRequest({ tenantId: '', shopperId: 'x' }, demoApiKey()));
    expect(res.status).toBe(400);
  });

  it('rejects a spoofed-mime image (jpeg mime, png bytes) with 400', async () => {
    // The png bytes sniff as png, but the declared mime is jpeg -> mime-mismatch -> INVALID_INPUT.
    const body = buildTryOnBody({ personMime: 'image/jpeg' });
    const res = await POST(buildPostRequest(body, demoApiKey()));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('INVALID_INPUT');
  });

  it('rejects a dimension-bomb image (5000x5000) with 400', async () => {
    const body = buildTryOnBody({ personBase64: OVERSIZE_DIMENSIONS_PNG_BASE64 });
    const res = await POST(buildPostRequest(body, demoApiKey()));
    expect(res.status).toBe(400);
  });
});

describe('OPTIONS /v1/tryons — CORS preflight', () => {
  it('returns 204 with the CORS headers including Authorization', async () => {
    const res = await OPTIONS(buildOptionsRequest('https://api.test/v1/tryons'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});
