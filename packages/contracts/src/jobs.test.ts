import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseTryOnJob, safeParseTryOnJob, TryOnJobStatusSchema } from './jobs.js';

/** A minimal valid job that individual tests mutate. */
function baseJob(): Record<string, unknown> {
  return {
    jobId: 'job-1',
    status: 'queued',
    request: {
      tenantId: 'tenant-1',
      shopperId: 'shopper-7',
      personImage: { kind: 'url', url: 'https://example.com/me.jpg' },
      productId: 'sku-42',
    },
    createdAt: '2026-06-16T12:00:00.000Z',
    updatedAt: '2026-06-16T12:00:01.000Z',
  };
}

describe('parseTryOnJob', () => {
  it('parses a valid queued job (request defaults applied)', () => {
    const job = parseTryOnJob(baseJob());
    expect(job.status).toBe('queued');
    expect(job.request.category).toBe('apparel');
  });

  it('accepts every status value', () => {
    for (const status of TryOnJobStatusSchema.options) {
      expect(safeParseTryOnJob({ ...baseJob(), status }).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(() => parseTryOnJob({ ...baseJob(), status: 'paused' })).toThrow(ZodError);
  });

  it('accepts a succeeded job carrying a result', () => {
    const job = parseTryOnJob({
      ...baseJob(),
      status: 'succeeded',
      result: {
        resultImageUrl: 'https://cdn.example.com/out.png',
        provider: 'fal',
        latencyMs: 900,
        cached: false,
        costUsd: 0.02,
      },
    });
    expect(job.result?.provider).toBe('fal');
  });

  it('accepts a failed job carrying an error', () => {
    const job = parseTryOnJob({ ...baseJob(), status: 'failed', error: 'provider timeout' });
    expect(job.error).toBe('provider timeout');
  });

  it('rejects an empty error string (boundary: min length 1)', () => {
    expect(() => parseTryOnJob({ ...baseJob(), error: '' })).toThrow(ZodError);
  });

  it('leaves result, error and idempotencyKey undefined when omitted', () => {
    const job = parseTryOnJob(baseJob());
    expect(job.result).toBeUndefined();
    expect(job.error).toBeUndefined();
    expect(job.idempotencyKey).toBeUndefined();
  });

  it('accepts an optional idempotencyKey', () => {
    expect(parseTryOnJob({ ...baseJob(), idempotencyKey: 'idem-abc' }).idempotencyKey).toBe(
      'idem-abc',
    );
  });

  it('rejects an empty idempotencyKey (boundary: min length 1)', () => {
    expect(() => parseTryOnJob({ ...baseJob(), idempotencyKey: '' })).toThrow(ZodError);
  });

  it('rejects a non-ISO createdAt datetime', () => {
    expect(() => parseTryOnJob({ ...baseJob(), createdAt: '2026-06-16 12:00' })).toThrow(ZodError);
  });

  it('throws when jobId is missing', () => {
    const { jobId: _omit, ...rest } = baseJob();
    expect(() => parseTryOnJob(rest)).toThrow(ZodError);
  });

  it('throws when the embedded request is invalid', () => {
    expect(() => parseTryOnJob({ ...baseJob(), request: { tenantId: 'only' } })).toThrow(ZodError);
  });

  it('safeParse fails for a missing updatedAt', () => {
    const { updatedAt: _omit, ...rest } = baseJob();
    expect(safeParseTryOnJob(rest).success).toBe(false);
  });
});
