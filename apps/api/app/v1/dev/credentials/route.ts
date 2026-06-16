/**
 * GET /v1/dev/credentials — hand a working demo API key to local clients.
 *
 * Returns `{ tenantId, apiKey }` for the seeded demo tenant so the demo-shop and the e2e suite
 * can obtain a real, working bearer key at runtime without a key being committed anywhere. This
 * endpoint is GATED, fail-closed: it serves credentials ONLY when `NODE_ENV !== 'production'` OR
 * `TRYIT_DEV_DEMO === '1'`. In production (without the explicit opt-in) it returns 404 and never
 * reveals a key — the demo plaintext must never escape a development process.
 */

import { getRuntime } from '../../../_lib/runtime';
import { preflightResponse, jsonResponse } from '../../../_lib/http';

/** Whether this dev-only endpoint is permitted to expose the demo credential. */
function devCredentialsEnabled(): boolean {
  // fail-closed: only outside production, or with an explicit opt-in, is the key exposed.
  return process.env.NODE_ENV !== 'production' || process.env.TRYIT_DEV_DEMO === '1';
}

/** CORS preflight for the dev-credentials endpoint. */
export async function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/** Return the demo tenant's credentials in dev, or a 404 when disabled. */
export async function GET(request: Request): Promise<Response> {
  if (!devCredentialsEnabled()) {
    // fail-closed: never expose a credential in production -> indistinguishable 404.
    return jsonResponse({ error: 'not_found' }, 404, request);
  }

  const runtime = getRuntime();
  const apiKey = runtime.tenantStore.getDemoApiKeyPlaintext();
  if (apiKey === undefined) {
    // No demo key retained (e.g. a production-shaped store) — fail closed with 404.
    return jsonResponse({ error: 'not_found' }, 404, request);
  }

  return jsonResponse({ tenantId: runtime.tenantStore.getDemoTenantId(), apiKey }, 200, request);
}
