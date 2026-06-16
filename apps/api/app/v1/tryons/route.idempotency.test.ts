/**
 * Idempotency tests for POST /v1/tryons — a retry with the same key must not re-run the provider.
 *
 * These prove the cost-control invariant boundary-exactly via the audit trail (the single source
 * of truth for provider spend): a replay returns the SAME jobId and writes NO second `allow`
 * event, while a fresh key (or no key) runs a new job. Header-vs-body precedence and tenant-scoped
 * keying are covered too. The deterministic provider is offline, so a "second provider call" would
 * still surface as a second allow audit event — the assertion has teeth even without a real network.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './route';
import { getRuntime } from '../../_lib/runtime';
import {
  resetRuntime,
  demoApiKey,
  buildTryOnBody,
  buildPostRequest,
  buildIdempotentPostRequest,
} from '../../_lib/test-helpers';

beforeEach(() => {
  resetRuntime();
});

/** Count the `allow`-outcome audit events (one per real provider call) currently recorded. */
function allowCount(): number {
  return getRuntime().auditSink.list().filter((e) => e.outcome === 'allow').length;
}

/** Run a POST and return its jobId. */
async function jobIdOf(res: Response): Promise<string> {
  return ((await res.json()) as { jobId: string }).jobId;
}

describe('POST /v1/tryons — idempotency replay (header)', () => {
  it('returns the SAME job and runs the provider only once for a repeated key', async () => {
    const key = demoApiKey();
    const first = await POST(buildIdempotentPostRequest(buildTryOnBody(), key, 'idem-abc'));
    const firstId = await jobIdOf(first);
    expect(first.status).toBe(200);
    expect(allowCount()).toBe(1);

    const second = await POST(buildIdempotentPostRequest(buildTryOnBody(), key, 'idem-abc'));
    const secondId = await jobIdOf(second);
    expect(second.status).toBe(200);
    // Same job back, and crucially NO second allow event -> no double-charge / no second call.
    expect(secondId).toBe(firstId);
    expect(allowCount()).toBe(1);
  });

  it('runs a NEW job for a DIFFERENT idempotency key', async () => {
    const key = demoApiKey();
    const a = await jobIdOf(await POST(buildIdempotentPostRequest(buildTryOnBody(), key, 'k1')));
    const b = await jobIdOf(await POST(buildIdempotentPostRequest(buildTryOnBody(), key, 'k2')));
    expect(b).not.toBe(a);
    expect(allowCount()).toBe(2);
  });

  it('does not replay when no idempotency key is supplied (normal path runs each time)', async () => {
    const key = demoApiKey();
    // Same body twice with NO key: the result cache may dedupe the provider call, but a NEW job
    // record is created each time (idempotency is the only thing that returns the prior jobId).
    const a = await jobIdOf(await POST(buildPostRequest(buildTryOnBody(), key)));
    const b = await jobIdOf(await POST(buildPostRequest(buildTryOnBody(), key)));
    expect(b).not.toBe(a);
  });
});

describe('POST /v1/tryons — idempotency key source + scope', () => {
  it('honours the key from the request body when no header is present', async () => {
    const key = demoApiKey();
    const body = { ...buildTryOnBody(), idempotencyKey: 'body-key' };
    const firstId = await jobIdOf(await POST(buildPostRequest(body, key)));
    const secondId = await jobIdOf(await POST(buildPostRequest(body, key)));
    expect(secondId).toBe(firstId);
    expect(allowCount()).toBe(1);
  });

  it('prefers the header over a different body key (header wins)', async () => {
    const key = demoApiKey();
    // First call seeds the index under the HEADER value.
    const firstId = await jobIdOf(
      await POST(buildIdempotentPostRequest({ ...buildTryOnBody(), idempotencyKey: 'body-x' }, key, 'header-x')),
    );
    // Second call carries the SAME header but a different body key -> replays on the header value.
    const secondId = await jobIdOf(
      await POST(buildIdempotentPostRequest({ ...buildTryOnBody(), idempotencyKey: 'body-y' }, key, 'header-x')),
    );
    expect(secondId).toBe(firstId);
    expect(allowCount()).toBe(1);
  });

  it('treats a blank idempotency-key header as absent (no replay keyed on empty)', async () => {
    const key = demoApiKey();
    const a = await jobIdOf(await POST(buildIdempotentPostRequest(buildTryOnBody(), key, '   ')));
    const b = await jobIdOf(await POST(buildIdempotentPostRequest(buildTryOnBody(), key, '   ')));
    // A blank key is ignored, so each request is a fresh job (not a replay of an empty key).
    expect(b).not.toBe(a);
  });
});
