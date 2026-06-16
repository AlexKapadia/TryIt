/**
 * @tryit/api/_lib/audit-events — construct well-formed audit events for the pipeline.
 *
 * Centralises building the {@link AuditEvent} shape the pipeline appends on every allow/deny/
 * error so the fields (actor, action, requestId, outcome, optional provider/cost) are consistent
 * and always schema-valid. The sink itself redacts secret-shaped fields and validates before
 * storing (defence in depth); this helper never places a secret in an event in the first place —
 * the actor is the shopper id, never the API key.
 */

import { randomUUID } from 'node:crypto';
import { type AuditEvent, type AuditOutcome, type ProviderId } from '@tryit/contracts';

/** The inputs needed to describe one audited try-on attempt. */
export interface AuditEventInput {
  readonly tenantId: string;
  /** Who initiated the action — the shopper id. NEVER the API key (no secret in the trail). */
  readonly actor: string;
  readonly requestId: string;
  readonly outcome: AuditOutcome;
  readonly provider?: ProviderId | undefined;
  readonly costUsd?: number | undefined;
}

/** The audited action name for a try-on request. */
export const TRYON_ACTION = 'tryon';

/**
 * Build a schema-shaped {@link AuditEvent} for a try-on attempt. `eventId` and `ts` are
 * generated here; optional `provider`/`costUsd` are included only when supplied so a denied
 * pre-provider failure carries neither.
 */
export function buildTryOnAuditEvent(input: AuditEventInput): AuditEvent {
  return {
    eventId: randomUUID(),
    ts: new Date().toISOString(),
    tenantId: input.tenantId,
    actor: input.actor, // shopper id — not a secret
    action: TRYON_ACTION,
    requestId: input.requestId,
    outcome: input.outcome,
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.costUsd !== undefined ? { costUsd: input.costUsd } : {}),
  };
}
