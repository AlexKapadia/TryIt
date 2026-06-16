/**
 * @tryit/contracts/audit — the append-only audit event contract.
 *
 * Every sensitive action and external call is recorded as an immutable audit event: what was
 * done, when, by whom, for which tenant and request, with what outcome and (where relevant)
 * cost. This is a compliance control — the log is append-only and must capture allow/deny/error
 * outcomes so a regulator can reconstruct exactly what happened. Events are parsed before being
 * written so a malformed record can never corrupt the audit trail.
 */

import { z } from 'zod';
import { ProviderIdSchema } from './providers.js';

/** The outcome of an audited action: it was permitted, refused, or errored. */
export const AuditOutcomeSchema = z.enum(['allow', 'deny', 'error']);

/** An audited action outcome. */
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

/**
 * A single append-only audit event.
 *
 * `actor` is who initiated the action (e.g. an api key id or shopper id); `action` names what
 * was attempted; `requestId` ties the event to a request. `provider` and `costUsd` are optional
 * because not every audited action touches a provider or incurs cost. `ts` is an ISO-8601 datetime.
 */
export const AuditEventSchema = z.object({
  eventId: z.string().min(1),
  ts: z.string().datetime(),
  tenantId: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  requestId: z.string().min(1),
  provider: ProviderIdSchema.optional(),
  costUsd: z.number().nonnegative().optional(),
  outcome: AuditOutcomeSchema,
});

/** A validated, append-only audit event. */
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * Parse an unknown input into a validated {@link AuditEvent}.
 *
 * @throws {z.ZodError} if the input does not satisfy {@link AuditEventSchema}.
 */
export function parseAuditEvent(input: unknown): AuditEvent {
  // fail-closed: a malformed audit record is rejected so the trail cannot be corrupted.
  return AuditEventSchema.parse(input);
}

/** Non-throwing variant of {@link parseAuditEvent}. */
export function safeParseAuditEvent(input: unknown): z.SafeParseReturnType<unknown, AuditEvent> {
  return AuditEventSchema.safeParse(input);
}
