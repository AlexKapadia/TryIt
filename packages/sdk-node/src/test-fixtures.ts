/**
 * @tryit/sdk-node/test-fixtures — synthetic, contract-valid sample objects for tests.
 *
 * Centralises the canonical valid {@link TryOnRequest} and {@link TryOnJob} shapes so each test
 * starts from a known-good baseline and mutates only the field under test. All data is synthetic
 * — no real PII, no real credentials. HTTPS URLs are placeholders the contracts accept.
 */

import type { TryOnJob, TryOnRequest } from '@tryit/contracts';

/** A minimal, contract-valid try-on request. */
export const VALID_REQUEST: TryOnRequest = {
  tenantId: 'tenant-1',
  shopperId: 'shopper-1',
  personImage: { kind: 'url', url: 'https://images.example/person.jpg' },
  productId: 'product-1',
  category: 'apparel',
};

/** A contract-valid queued job wrapping {@link VALID_REQUEST}. */
export const QUEUED_JOB: TryOnJob = {
  jobId: 'job-1',
  status: 'queued',
  request: VALID_REQUEST,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** A contract-valid succeeded job (terminal) with a result. */
export const SUCCEEDED_JOB: TryOnJob = {
  ...QUEUED_JOB,
  status: 'succeeded',
  result: {
    resultImageUrl: 'https://images.example/result.jpg',
    provider: 'deterministic',
    latencyMs: 120,
    cached: false,
    costUsd: 0.01,
  },
  updatedAt: '2026-01-01T00:00:05.000Z',
};

/** A contract-valid processing (non-terminal) job. */
export const PROCESSING_JOB: TryOnJob = { ...QUEUED_JOB, status: 'processing' };

/** A contract-valid failed (terminal) job. */
export const FAILED_JOB: TryOnJob = {
  ...QUEUED_JOB,
  status: 'failed',
  error: 'provider exhausted',
};

/** Serialise an object as a JSON body, mirroring what a real server would return. */
export function asBody(value: unknown): string {
  return JSON.stringify(value);
}
