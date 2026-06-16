import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { AuditOutcomeSchema, parseAuditEvent, safeParseAuditEvent } from './audit.js';

/** A minimal valid audit event that individual tests mutate. */
function baseEvent(): Record<string, unknown> {
  return {
    eventId: 'evt-1',
    ts: '2026-06-16T12:00:00.000Z',
    tenantId: 'tenant-1',
    actor: 'apikey-9',
    action: 'tryon.create',
    requestId: 'req-1',
    outcome: 'allow',
  };
}

describe('parseAuditEvent', () => {
  it('parses a valid allow event', () => {
    expect(parseAuditEvent(baseEvent())).toEqual({ ...baseEvent() });
  });

  it('accepts every outcome value', () => {
    for (const outcome of AuditOutcomeSchema.options) {
      expect(safeParseAuditEvent({ ...baseEvent(), outcome }).success).toBe(true);
    }
  });

  it('rejects an unknown outcome', () => {
    expect(() => parseAuditEvent({ ...baseEvent(), outcome: 'maybe' })).toThrow(ZodError);
  });

  it('accepts optional provider and costUsd', () => {
    const event = parseAuditEvent({ ...baseEvent(), provider: 'fal', costUsd: 0.05 });
    expect(event.provider).toBe('fal');
    expect(event.costUsd).toBe(0.05);
  });

  it('leaves provider and costUsd undefined when omitted', () => {
    const event = parseAuditEvent(baseEvent());
    expect(event.provider).toBeUndefined();
    expect(event.costUsd).toBeUndefined();
  });

  it('rejects an unknown provider', () => {
    expect(() => parseAuditEvent({ ...baseEvent(), provider: 'nope' })).toThrow(ZodError);
  });

  it('rejects a negative costUsd (boundary: just-under 0)', () => {
    expect(() => parseAuditEvent({ ...baseEvent(), costUsd: -0.01 })).toThrow(ZodError);
  });

  it('accepts costUsd = 0 (boundary: at 0)', () => {
    expect(parseAuditEvent({ ...baseEvent(), costUsd: 0 }).costUsd).toBe(0);
  });

  it('rejects a non-ISO ts', () => {
    expect(() => parseAuditEvent({ ...baseEvent(), ts: 'yesterday' })).toThrow(ZodError);
  });

  it('throws when each required field is missing', () => {
    for (const key of ['eventId', 'ts', 'tenantId', 'actor', 'action', 'requestId', 'outcome']) {
      const event = baseEvent();
      delete event[key];
      expect(() => parseAuditEvent(event)).toThrow(ZodError);
    }
  });

  it('rejects an empty action string (boundary: min length 1)', () => {
    expect(() => parseAuditEvent({ ...baseEvent(), action: '' })).toThrow(ZodError);
  });

  it('safeParse fails and reports the path for a missing requestId', () => {
    const { requestId: _omit, ...rest } = baseEvent();
    const parsed = safeParseAuditEvent(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'requestId')).toBe(true);
    }
  });
});
