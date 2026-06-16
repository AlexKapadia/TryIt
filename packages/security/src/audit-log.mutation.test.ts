/**
 * Mutation-hardening tests for audit-log redaction.
 *
 * Pins every secret-shaped key in REDACT_KEYS (so blanking any one literal to "" is caught) and
 * proves a top-level array stays an array after redaction (so dropping the `Array.isArray` branch
 * is caught — without it an array would be reshaped into an index-keyed object). Real teeth, no
 * tautologies.
 */
import { describe, expect, it } from 'vitest';
import { redactSecrets } from './audit-log.js';

describe('every REDACT_KEYS entry is enforced (kills blanked-literal mutants)', () => {
  // One assertion per key in the redaction set. If any literal were mutated to "", that key would
  // no longer match and its secret value would survive — failing the corresponding case below.
  const SECRET_KEYS = [
    'apikey',
    'apikeyplaintext',
    'plaintext',
    'secret',
    'token',
    'authorization',
    'password',
    'data',
    'imagedata',
    'bytes',
  ];

  it.each(SECRET_KEYS)('redacts the "%s" key', (key) => {
    const out = redactSecrets({ [key]: 'super-secret-value' }) as Record<string, unknown>;
    expect(out[key]).toBe('[REDACTED]');
  });

  it.each(SECRET_KEYS)('redacts the "%s" key case-insensitively (upper-case)', (key) => {
    const upper = key.toUpperCase();
    const out = redactSecrets({ [upper]: 'super-secret-value' }) as Record<string, unknown>;
    expect(out[upper]).toBe('[REDACTED]');
  });
});

describe('array handling is structurally preserved (kills the Array.isArray branch removal)', () => {
  it('returns a genuine array (not an index-keyed object) for a top-level array input', () => {
    const out = redactSecrets([{ apikey: 'x' }, { keep: 'y' }]);
    expect(Array.isArray(out)).toBe(true); // dropping the array branch would yield a plain object
    const arr = out as Array<Record<string, unknown>>;
    expect(arr).toHaveLength(2);
    expect(arr[0]!['apikey']).toBe('[REDACTED]');
    expect(arr[1]!['keep']).toBe('y');
  });

  it('preserves nested arrays as arrays', () => {
    const out = redactSecrets({ items: [{ secret: 's' }] }) as Record<string, unknown>;
    expect(Array.isArray(out['items'])).toBe(true);
    expect((out['items'] as Array<Record<string, unknown>>)[0]!['secret']).toBe('[REDACTED]');
  });
});
