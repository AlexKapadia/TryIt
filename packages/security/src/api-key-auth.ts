/**
 * @tryit/security/api-key-auth — issue and verify tenant-scoped API keys.
 *
 * Callers authenticate to the TryIt API with a bearer key. This module mints keys and
 * verifies them without ever persisting the secret: only a salted hash of the plaintext is
 * stored, so a leaked datastore cannot be replayed against the API. Verification is
 * fail-closed — an unknown, tampered, expired, wrong-tenant, or out-of-scope key is denied,
 * and the secret comparison runs in constant time to deny a timing side-channel (threat: key
 * brute-force via response-time analysis).
 */
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/** scrypt cost parameter. 2^15 is OWASP-recommended for interactive auth. */
const SCRYPT_N = 1 << 15;
/** scrypt block size. */
const SCRYPT_R = 8;
/** scrypt parallelisation. */
const SCRYPT_P = 1;
/** Derived-hash length in bytes. */
const HASH_BYTES = 32;
/** Salt length in bytes — 16 bytes of CSPRNG entropy per key. */
const SALT_BYTES = 16;
/**
 * scrypt memory ceiling. Default is 32 MiB which N=2^15,r=8 sits right on; raise it so the KDF
 * runs without tripping the limit while still bounding memory (control: bounded KDF cost).
 */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
/** Plaintext secret length in bytes before hex encoding. */
const SECRET_BYTES = 32;
/** Key-id length in bytes before hex encoding. */
const KEY_ID_BYTES = 12;

/** A persisted API-key record. Contains only a salted hash — never the plaintext secret. */
export interface ApiKeyRecord {
  /** Public, non-secret identifier for this key (safe to log / index by). */
  readonly keyId: string;
  /** Tenant this key authenticates as. A key is valid only for its own tenant. */
  readonly tenantId: string;
  /** Scopes granted to this key. */
  readonly scopes: readonly string[];
  /** Hex-encoded scrypt salt. */
  readonly salt: string;
  /** Hex-encoded scrypt-derived hash of the plaintext secret. */
  readonly hash: string;
  /** Optional ISO-8601 expiry. When absent, the key does not expire. */
  readonly expiresAt?: string;
}

/** The result of minting a key: the one-time plaintext plus the storable record. */
export interface CreatedApiKey {
  readonly keyId: string;
  /** Shown to the caller exactly once; never persisted. */
  readonly plaintext: string;
  readonly record: ApiKeyRecord;
}

/** Inputs for minting a new tenant-scoped key. */
export interface CreateApiKeyInput {
  readonly tenantId: string;
  readonly scopes: readonly string[];
  /** Optional ISO-8601 expiry. */
  readonly expiresAt?: string;
}

/** Context a verification must satisfy: the tenant the request targets and required scopes. */
export interface VerifyContext {
  readonly tenantId: string;
  /** Scopes the action requires; the key must hold all of them. */
  readonly requiredScopes?: readonly string[];
  /** Current time, injected for testability. Defaults to wall clock. */
  readonly now?: Date;
}

/** Why a verification failed. Deny-by-default: any non-`ok` result refuses the action. */
export type VerifyFailureReason =
  | 'malformed'
  | 'mismatch'
  | 'expired'
  | 'wrong-tenant'
  | 'missing-scope';

/** Discriminated verification outcome. */
export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: VerifyFailureReason };

/** Derive the scrypt hash for a plaintext + hex salt, returned as a raw buffer. */
function deriveHash(plaintext: string, saltHex: string): Buffer {
  return scryptSync(plaintext, Buffer.from(saltHex, 'hex'), HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

/**
 * Mint a tenant-scoped API key. Returns the plaintext (shown once) and a record that stores
 * only a salted scrypt hash. Each key gets a fresh CSPRNG salt, so identical secrets never
 * produce identical hashes (control: defeats precomputed-hash / rainbow-table attacks).
 */
export function createApiKey(input: CreateApiKeyInput): CreatedApiKey {
  const keyId = randomBytes(KEY_ID_BYTES).toString('hex'); // public id, non-secret
  const plaintext = randomBytes(SECRET_BYTES).toString('hex'); // CSPRNG secret
  const salt = randomBytes(SALT_BYTES).toString('hex'); // per-key unique salt
  const hash = deriveHash(plaintext, salt).toString('hex');

  const record: ApiKeyRecord = {
    keyId,
    tenantId: input.tenantId,
    scopes: [...input.scopes],
    salt,
    hash,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  };
  return { keyId, plaintext, record };
}

/**
 * Verify a presented plaintext against a stored record within a request context.
 *
 * Fail-closed: returns `{ ok: false, reason }` for any malformed record, hash mismatch,
 * expired key, tenant mismatch, or missing scope. The secret comparison uses
 * {@link timingSafeEqual} over equal-length buffers so verification time does not leak how
 * many bytes matched (control: constant-time secret comparison).
 */
export function verifyApiKey(
  plaintext: string,
  record: ApiKeyRecord,
  ctx: VerifyContext,
): VerifyResult {
  // fail-closed: a structurally broken record can never authenticate.
  if (
    typeof plaintext !== 'string' ||
    plaintext.length === 0 ||
    typeof record.salt !== 'string' ||
    typeof record.hash !== 'string' ||
    record.salt.length === 0 ||
    record.hash.length === 0
  ) {
    return { ok: false, reason: 'malformed' };
  }

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(record.hash, 'hex');
    actual = deriveHash(plaintext, record.salt);
  } catch {
    return { ok: false, reason: 'malformed' }; // fail-closed on undecodable record
  }

  // Constant-time over equal-length buffers; unequal length is a definite mismatch.
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return { ok: false, reason: 'mismatch' };
  }

  // tenant isolation: a valid secret is still refused outside its own tenant.
  if (record.tenantId !== ctx.tenantId) {
    return { ok: false, reason: 'wrong-tenant' };
  }

  // fail-closed: an expired key is refused even though its secret matches.
  if (record.expiresAt !== undefined) {
    const now = ctx.now ?? new Date();
    const exp = Date.parse(record.expiresAt);
    if (Number.isNaN(exp) || now.getTime() >= exp) {
      return { ok: false, reason: 'expired' };
    }
  }

  // least privilege: every required scope must be granted, else refuse.
  if (ctx.requiredScopes !== undefined) {
    const granted = new Set(record.scopes);
    for (const need of ctx.requiredScopes) {
      if (!granted.has(need)) {
        return { ok: false, reason: 'missing-scope' };
      }
    }
  }

  return { ok: true };
}
