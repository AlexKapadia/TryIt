/**
 * @tryit/contracts — shared typed data contracts for the TryIt virtual try-on platform.
 *
 * This module is the single source of truth for the wire-level shapes that flow between
 * the API, engine, providers, and SDKs. Contracts are declared as Zod schemas so that both
 * runtime validation (untrusted input is parsed, never trusted) and static TypeScript types
 * derive from one definition and can never drift apart. Treat every external input as
 * untrusted: callers parse with these schemas at the boundary and fail closed on invalid data.
 *
 * This file is a barrel — the contracts themselves live in focused, single-responsibility
 * modules (images, tryon, jobs, providers, tenant, audit, errors) and are re-exported here.
 */

export * from './images.js';
export * from './tryon.js';
export * from './jobs.js';
export * from './providers.js';
export * from './tenant.js';
export * from './audit.js';
export * from './errors.js';
