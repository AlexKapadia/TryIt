/**
 * Mutation-hardening tests for tenant-scoped API-key verification.
 *
 * The round-trip tests cannot catch mutations to the KDF itself (both mint and verify use the
 * same code, so a mutated salt-encoding or scrypt parameter still self-consistently verifies).
 * Here we pin a FIXED known-answer vector — a literal plaintext + salt + precomputed scrypt hash
 * — so that mutating the `'hex'` salt decoding or the scrypt options object changes the derived
 * hash and breaks verification. We also exercise the non-string `typeof` guards and the
 * no-expiry spread path that the existing suite leaves untested. Boundary-exact, real teeth.
 */
import { describe, expect, it } from 'vitest';
import { createApiKey, verifyApiKey, type ApiKeyRecord } from './api-key-auth.js';

const TENANT = 'tenant-a';

/**
 * Known-answer vector: scrypt(plaintext, salt, 32, {N:2^15, r:8, p:1}) precomputed with the exact
 * parameters this module declares. If deriveHash mutates the salt encoding (`'hex' -> ''`) or the
 * options object (`{...} -> {}`, which would fall back to scrypt's default N=16384), the derived
 * hash will not equal this stored vector and verification flips to `mismatch` — killing the mutant.
 */
const FIXED = {
  plaintext: 'known-plaintext-secret',
  salt: '00112233445566778899aabbccddeeff',
  hash: '0fc7f1e64d48a2e08c8aaf308eeca13de603ba8f0e791776bba33dd23e7d7363',
} as const;

const fixedRecord = (): ApiKeyRecord => ({
  keyId: 'kid-fixed',
  tenantId: TENANT,
  scopes: [],
  salt: FIXED.salt,
  hash: FIXED.hash,
});

describe('KDF known-answer vector (kills salt-encoding and scrypt-param mutants)', () => {
  it('verifies the genuine plaintext against the precomputed scrypt hash', () => {
    expect(verifyApiKey(FIXED.plaintext, fixedRecord(), { tenantId: TENANT })).toEqual({
      ok: true,
    });
  });

  it('rejects a near-miss plaintext against the same fixed vector', () => {
    // Any other plaintext derives a different hash; proves the vector is genuinely discriminating
    // and not trivially accepted regardless of input.
    expect(verifyApiKey('known-plaintext-secres', fixedRecord(), { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });
});

describe('malformed-record typeof guards (kills the false-ing of the typeof arms)', () => {
  // These use NON-STRING values that would NOT throw downstream if the guard were removed, so the
  // only thing producing `malformed` is the typeof guard itself. A numeric value would throw in
  // Buffer.from and be caught as malformed anyway (guard-redundant); an array decodes cleanly, so
  // removing the guard yields `mismatch` instead — which these exact-reason assertions catch.

  it('refuses a record whose salt is an array, not a string (reason stays malformed)', () => {
    // Array salt: if the `typeof salt !== "string"` arm were neutralised, Buffer.from(array,"hex")
    // succeeds and the derive runs to a mismatch — a different reason than malformed.
    const bad = { ...fixedRecord(), salt: [0, 1, 2, 3] as unknown as string };
    expect(verifyApiKey(FIXED.plaintext, bad, { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('refuses a record whose hash is an array, not a string (reason stays malformed)', () => {
    const bad = { ...fixedRecord(), hash: [1, 2, 3] as unknown as string };
    expect(verifyApiKey(FIXED.plaintext, bad, { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('refuses a Buffer plaintext even when it would derive the genuine hash', () => {
    // Buffer.from("known-plaintext-secret") is a valid scrypt password; if the plaintext typeof
    // guard were removed it would derive the stored hash and WRONGLY return ok:true. The guard
    // must refuse it as malformed because plaintext is not a string.
    const bufPlaintext = Buffer.from(FIXED.plaintext, 'utf8') as unknown as string;
    expect(verifyApiKey(bufPlaintext, fixedRecord(), { tenantId: TENANT })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('createApiKey expiry-spread path (kills the L118 conditional)', () => {
  it('omits expiresAt entirely when none is supplied', () => {
    const { record } = createApiKey({ tenantId: TENANT, scopes: [] });
    // If the spread condition were forced true, the record would carry `expiresAt: undefined`.
    expect('expiresAt' in record).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(record, 'expiresAt')).toBe(false);
  });

  it('includes expiresAt verbatim when supplied', () => {
    const exp = '2099-01-01T00:00:00.000Z';
    const { record } = createApiKey({ tenantId: TENANT, scopes: [], expiresAt: exp });
    expect(record.expiresAt).toBe(exp);
  });
});
