/**
 * @tryit/security — security primitives for the TryIt virtual try-on platform.
 *
 * Authentication (tenant-scoped API keys), rate limiting (per-shopper + aggregate per-tenant),
 * untrusted-image validation (magic-byte sniffing + pure-TS dimension parsing), and the
 * append-only audit log. Every control is fail-closed: when a key, permission, or check is
 * missing or ambiguous, the action is refused rather than allowed through.
 *
 * This file is a barrel — the controls live in focused, single-responsibility modules and are
 * re-exported here.
 */
export * from './api-key-auth.js';
export * from './rate-limit.js';
export * from './image-dimensions.js';
export * from './image-validation.js';
export * from './audit-log.js';
