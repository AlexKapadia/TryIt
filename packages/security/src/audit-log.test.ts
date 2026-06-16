/**
 * Tests for the append-only audit sink. Asserts immutability/ordering of stored events, that
 * secret-shaped fields are redacted before storage, and that schema-invalid events are refused.
 */
import { describe, expect, it } from 'vitest';
import {
  InMemoryAuditSink,
  redactAndValidateAuditEvent,
  redactSecrets,
  type AuditSink,
} from './audit-log.js';

const baseEvent = () => ({
  eventId: 'evt-1',
  ts: '2026-01-01T00:00:00.000Z',
  tenantId: 't1',
  actor: 'key-abc',
  action: 'tryon.create',
  requestId: 'req-1',
  outcome: 'allow' as const,
});

describe('append-only interface shape', () => {
  it('exposes no update or delete method on the interface', () => {
    const sink: AuditSink = new InMemoryAuditSink();
    expect((sink as unknown as Record<string, unknown>)['update']).toBeUndefined();
    expect((sink as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });
});

describe('immutability and ordering', () => {
  it('preserves append order across multiple events', () => {
    const sink = new InMemoryAuditSink();
    sink.append({ ...baseEvent(), eventId: 'a' });
    sink.append({ ...baseEvent(), eventId: 'b' });
    sink.append({ ...baseEvent(), eventId: 'c' });
    expect(sink.list().map((e) => e.eventId)).toEqual(['a', 'b', 'c']);
    expect(sink.size()).toBe(3);
  });

  it('does not let a caller mutate the recorded trail via the returned list', () => {
    const sink = new InMemoryAuditSink();
    sink.append(baseEvent());
    const snapshot = sink.list() as unknown as unknown[];
    snapshot.push({ tampered: true }); // mutate the returned array
    snapshot.length = 0; // try to clear it
    expect(sink.size()).toBe(1); // backing store is untouched
  });
});

describe('redaction of secret/PII-shaped fields', () => {
  it('blanks each secret-shaped key while preserving non-secret keys', () => {
    const out = redactSecrets({
      apiKey: 'ak_live_123',
      plaintext: 'raw-secret',
      token: 'jwt.abc.def',
      authorization: 'Bearer xyz',
      password: 'hunter2',
      data: 'iVBORw0base64image==',
      keepMe: 'visible-value',
    }) as Record<string, unknown>;
    expect(out['apiKey']).toBe('[REDACTED]');
    expect(out['plaintext']).toBe('[REDACTED]');
    expect(out['token']).toBe('[REDACTED]');
    expect(out['authorization']).toBe('[REDACTED]');
    expect(out['password']).toBe('[REDACTED]');
    expect(out['data']).toBe('[REDACTED]');
    expect(out['keepMe']).toBe('visible-value'); // non-secret survives untouched
  });

  it('redacts case-insensitively and inside nested objects and arrays', () => {
    const out = redactSecrets({
      level1: { APIKEY: 'x', items: [{ Secret: 's1' }, { Secret: 's2' }] },
    }) as Record<string, Record<string, unknown>>;
    expect(out['level1']!['APIKEY']).toBe('[REDACTED]');
    const items = out['level1']!['items'] as Array<Record<string, unknown>>;
    expect(items[0]!['Secret']).toBe('[REDACTED]');
    expect(items[1]!['Secret']).toBe('[REDACTED]');
  });

  it('does not mutate the input object', () => {
    const input = { apiKey: 'secret', keep: 1 };
    const out = redactSecrets(input) as Record<string, unknown>;
    expect(input.apiKey).toBe('secret'); // original untouched
    expect(out['apiKey']).toBe('[REDACTED]');
  });

  it('leaves primitives and null unchanged', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets(null)).toBeNull();
  });

  it('redacts before schema validation in redactAndValidateAuditEvent', () => {
    // `data` is an inline-image key; the schema strips it, but redaction proves the policy ran.
    const stored = redactAndValidateAuditEvent(baseEvent());
    expect(stored.eventId).toBe('evt-1');
    expect(stored.actor).toBe('key-abc');
  });
});

describe('schema-invalid events refused (fail-closed)', () => {
  it('throws when a required field is missing', () => {
    const sink = new InMemoryAuditSink();
    const { eventId: _drop, ...incomplete } = baseEvent();
    expect(() => sink.append(incomplete)).toThrow();
    expect(sink.size()).toBe(0); // nothing was appended
  });

  it('throws when outcome is not in the allowed enum', () => {
    const sink = new InMemoryAuditSink();
    expect(() => sink.append({ ...baseEvent(), outcome: 'maybe' })).toThrow();
    expect(sink.size()).toBe(0);
  });

  it('throws on a completely non-object input', () => {
    const sink = new InMemoryAuditSink();
    expect(() => sink.append('not-an-event')).toThrow();
    expect(() => sink.append(null)).toThrow();
    expect(sink.size()).toBe(0);
  });
});
