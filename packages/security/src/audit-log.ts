/**
 * @tryit/security/audit-log — append-only sink for compliance audit events.
 *
 * Every sensitive action is recorded as an immutable {@link AuditEvent}. The {@link AuditSink}
 * interface exposes ONLY `append` and read accessors — there is deliberately no update or delete,
 * so a recorded event cannot be altered or erased (control: append-only audit trail). Each event
 * is validated with {@link AuditEventSchema} before it is stored, so a malformed record can never
 * enter the trail, and secret-shaped fields are redacted before storage so api keys or inline
 * image data can never leak into the log (control: no secrets/PII in audit records). Validation is
 * fail-closed: an event that does not parse is refused, not stored.
 */
import {
  AuditEventSchema,
  parseAuditEvent,
  type AuditEvent,
} from '@tryit/contracts';

/**
 * An append-only audit sink. There is intentionally no `update`/`delete` method — the absence is
 * the control. Implementations validate and redact before persisting.
 */
export interface AuditSink {
  /**
   * Validate, redact, and append an event. Returns the stored (redacted) event.
   * @throws if the event does not satisfy {@link AuditEventSchema} (fail-closed).
   */
  append(event: unknown): AuditEvent;
  /** Return a defensive copy of all stored events in append order. */
  list(): readonly AuditEvent[];
  /** Number of events recorded. */
  size(): number;
}

/**
 * Keys whose values are secret- or PII-shaped and must never be stored verbatim. We redact by
 * key name across the whole event so that, even if a caller smuggles a secret into a free-text
 * field via an unexpected key, it does not survive into the trail.
 */
const REDACT_KEYS = new Set([
  'apikey',
  'apikeyplaintext',
  'plaintext',
  'secret',
  'token',
  'authorization',
  'password',
  'data', // inline base64 image data
  'imagedata',
  'bytes',
]);

/** Placeholder substituted for any redacted value. */
const REDACTED = '[REDACTED]';

/**
 * Recursively redact secret-shaped fields by key name (case-insensitive). Returns a new object;
 * the input is never mutated. Non-plain values are returned as-is. Exported so the redaction
 * policy can be asserted directly — it runs before schema validation, defence-in-depth against a
 * secret reaching storage even if a future schema keeps a free-text field.
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = REDACT_KEYS.has(key.toLowerCase()) ? REDACTED : redactSecrets(v);
    }
    return out;
  }
  return value;
}

/**
 * In-memory append-only audit sink. Suitable for tests and single-process use; production wires a
 * durable, tamper-evident store behind the same {@link AuditSink} interface. The backing array is
 * private and never exposed by reference, so callers cannot mutate recorded history.
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];

  append(event: unknown): AuditEvent {
    // Redact BEFORE validation so secret-shaped fields never reach storage even transiently.
    const redacted = redactSecrets(event);
    // fail-closed: a malformed event throws here and is never appended.
    const validated = parseAuditEvent(redacted);
    this.events.push(validated);
    return validated;
  }

  list(): readonly AuditEvent[] {
    // Defensive copy: callers cannot splice/reorder the recorded trail.
    return [...this.events];
  }

  size(): number {
    return this.events.length;
  }
}

/**
 * Test/utility helper: redact then validate without storing. Exposes the same redaction the sink
 * applies so callers can pre-check an event. Re-exports schema use so the redaction policy and the
 * schema stay co-located.
 */
export function redactAndValidateAuditEvent(event: unknown): AuditEvent {
  return AuditEventSchema.parse(redactSecrets(event));
}
