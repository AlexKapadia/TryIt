/**
 * @tryit/api/_lib/pipeline-errors — typed pipeline failures + budget accounting helpers.
 *
 * The pipeline expresses every deny path as a typed {@link PipelineError} carrying an
 * {@link ApiError} (code + message + HTTP status) and an optional `retryAfterMs` for rate
 * limiting. Route handlers map these onto HTTP responses via the canonical status mapping in
 * @tryit/contracts, so a failure can never surface as an accidental 2xx (fail-closed). This
 * module also holds the small pure helper that sums a tenant's audited cost for the current
 * billing period, used by the budget guard.
 */

import { makeApiError, type ApiError, type ErrorCode, type AuditEvent } from '@tryit/contracts';

/**
 * A typed pipeline failure. Thrown by any pipeline step that must refuse; carries the wire
 * {@link ApiError} plus, for rate limiting, the milliseconds until the caller may retry.
 */
export class PipelineError extends Error {
  readonly apiError: ApiError;
  readonly retryAfterMs: number | undefined;

  constructor(code: ErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'PipelineError';
    this.apiError = makeApiError(code, message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** Narrowing guard so handlers can branch on a typed pipeline failure vs. an unexpected one. */
export function isPipelineError(value: unknown): value is PipelineError {
  return value instanceof PipelineError;
}

/**
 * Sum the audited `costUsd` already spent by a tenant in the current billing period.
 *
 * Only `allow`-outcome events with a cost contribute (a denied/errored call was not billed).
 * The audit sink is the single source of truth for spend, so this stays consistent with what
 * was actually charged. The "period" here is the whole in-memory trail (the dev sink resets per
 * process); a durable production sink would filter by month — the guard logic is identical.
 */
export function sumTenantSpendUsd(events: readonly AuditEvent[], tenantId: string): number {
  let total = 0;
  for (const event of events) {
    if (event.tenantId === tenantId && event.outcome === 'allow' && event.costUsd !== undefined) {
      total += event.costUsd;
    }
  }
  return total;
}
