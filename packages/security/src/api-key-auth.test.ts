/**
 * Tests for tenant-scoped API-key issue/verify. Adversarial: tamper, expiry boundaries, tenant
 * isolation, scope enforcement, and a property that no non-genuine secret ever verifies.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createApiKey,
  verifyApiKey,
  type ApiKeyRecord,
} from './api-key-auth.js';

const TENANT = 'tenant-a';

describe('createApiKey', () => {
  it('never stores the plaintext secret in the record', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    expect(record).not.toHaveProperty('plaintext');
    expect(JSON.stringify(record)).not.toContain(plaintext);
    expect(record.hash).not.toEqual(plaintext);
  });

  it('produces a unique salt and hash per call for distinct secrets', () => {
    const a = createApiKey({ tenantId: TENANT, scopes: [] });
    const b = createApiKey({ tenantId: TENANT, scopes: [] });
    expect(a.record.salt).not.toEqual(b.record.salt);
    expect(a.record.hash).not.toEqual(b.record.hash);
    expect(a.keyId).not.toEqual(b.keyId);
  });
});

describe('verifyApiKey round-trip', () => {
  it('verifies a freshly issued key for its own tenant', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: ['tryon:create'] });
    expect(verifyApiKey(plaintext, record, { tenantId: TENANT })).toEqual({ ok: true });
  });
});

describe('verifyApiKey tamper rejection', () => {
  it('rejects a one-character tamper of the plaintext', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    const first = plaintext[0] === 'a' ? 'b' : 'a';
    const tampered = first + plaintext.slice(1);
    expect(verifyApiKey(tampered, record, { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects when the stored hash is mutated by one hex char', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    const ch = record.hash[0] === '0' ? '1' : '0';
    const bad: ApiKeyRecord = { ...record, hash: ch + record.hash.slice(1) };
    expect(verifyApiKey(plaintext, bad, { tenantId: TENANT }).ok).toBe(false);
  });

  it('fails closed on a malformed (empty) record', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    expect(verifyApiKey(plaintext, { ...record, salt: '' }, { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyApiKey(plaintext, { ...record, hash: '' }, { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyApiKey('', record, { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('fails closed when the stored hash is not valid hex (undecodable)', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    // 'zz' decodes to an empty buffer under hex -> length mismatch -> still denied.
    const bad: ApiKeyRecord = { ...record, hash: 'zz' };
    expect(verifyApiKey(plaintext, bad, { tenantId: TENANT }).ok).toBe(false);
  });
});

describe('verifyApiKey tenant isolation', () => {
  it('denies a valid secret presented for the wrong tenant', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    expect(verifyApiKey(plaintext, record, { tenantId: 'tenant-b' })).toEqual({
      ok: false,
      reason: 'wrong-tenant',
    });
  });
});

describe('verifyApiKey scope enforcement', () => {
  it('allows when all required scopes are granted', () => {
    const { plaintext, record } = createApiKey({
      tenantId: TENANT,
      scopes: ['tryon:create', 'tryon:read'],
    });
    expect(
      verifyApiKey(plaintext, record, {
        tenantId: TENANT,
        requiredScopes: ['tryon:read'],
      }),
    ).toEqual({ ok: true });
  });

  it('denies when a required scope is missing (least privilege)', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: ['tryon:read'] });
    expect(
      verifyApiKey(plaintext, record, {
        tenantId: TENANT,
        requiredScopes: ['tryon:create'],
      }),
    ).toEqual({ ok: false, reason: 'missing-scope' });
  });
});

describe('verifyApiKey expiry (injected clock)', () => {
  const base = createApiKey({
    tenantId: TENANT,
    scopes: [],
    expiresAt: '2026-01-01T00:00:00.000Z',
  });
  const expMs = Date.parse('2026-01-01T00:00:00.000Z');

  it('allows one millisecond before expiry', () => {
    const now = new Date(expMs - 1);
    expect(verifyApiKey(base.plaintext, base.record, { tenantId: TENANT, now })).toEqual({
      ok: true,
    });
  });

  it('denies exactly at expiry (inclusive cutoff)', () => {
    const now = new Date(expMs);
    expect(verifyApiKey(base.plaintext, base.record, { tenantId: TENANT, now })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('denies one millisecond after expiry', () => {
    const now = new Date(expMs + 1);
    expect(verifyApiKey(base.plaintext, base.record, { tenantId: TENANT, now }).reason).toBe(
      'expired',
    );
  });

  it('fails closed when expiresAt is unparseable', () => {
    const bad: ApiKeyRecord = { ...base.record, expiresAt: 'not-a-date' };
    expect(verifyApiKey(base.plaintext, bad, { tenantId: TENANT, now: new Date(0) })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('verifyApiKey property: only the genuine secret verifies', () => {
  it('rejects every secret that is not the issued plaintext', () => {
    const { plaintext, record } = createApiKey({ tenantId: TENANT, scopes: [] });
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 80 }), (candidate) => {
        const result = verifyApiKey(candidate, record, { tenantId: TENANT });
        if (candidate === plaintext) {
          return result.ok === true;
        }
        return result.ok === false;
      }),
      // scrypt is intentionally expensive; 30 adversarial candidates is ample alongside the
      // explicit one-char-tamper and malformed-record tests above.
      { numRuns: 30 },
    );
  });
});
