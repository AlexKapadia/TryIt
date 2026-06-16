/**
 * @tryit/api/_lib/test-helpers — shared fixtures + request builders for the in-process tests.
 *
 * The route/pipeline tests exercise the real handlers by constructing Web `Request` objects and
 * calling the exported functions directly — NO server, NO network. The deterministic provider is
 * the offline default, so a happy-path run never touches an external service. These helpers keep
 * each test terse: a valid base64 PNG person image, a request-body factory, a bearer-request
 * builder, and a singleton reset so every test starts from clean rate-limit/cache/audit/jobs
 * state. (Test-support module, not shipped runtime; exempt from the no-`test` naming rule.)
 */

import { resetRuntimeForTest, getRuntime } from './runtime';

/**
 * A valid 1x1 PNG (signature + IHDR with width=1 height=1) as base64. Sniffs as image/png and
 * parses to in-range dimensions, so it passes the image validator. Built by hand so the fixture
 * is deterministic and dependency-free.
 */
export const VALID_PNG_1X1_BASE64 = 'iVBORw0KGgoAAAAASUhEUgAAAAEAAAAB';

/** A valid PNG header declaring 5000x5000 — exceeds the 4096 dimension ceiling (dimension bomb). */
export const OVERSIZE_DIMENSIONS_PNG_BASE64 = 'iVBORw0KGgoAAAAASUhEUgAAE4gAABOI';

/** Reset all process singletons so a test sees fresh rate-limit/cache/audit/jobs state. */
export function resetRuntime(): void {
  resetRuntimeForTest();
}

/** Fetch the seeded demo tenant's working API key (dev-only accessor) for a test. */
export function demoApiKey(): string {
  const key = getRuntime().tenantStore.getDemoApiKeyPlaintext();
  if (key === undefined) {
    throw new Error('test setup: demo api key not seeded');
  }
  return key;
}

/** The seeded demo tenant id. */
export const DEMO_TENANT = 'demo-tenant';

/** Options for {@link buildTryOnBody}. */
export interface TryOnBodyOptions {
  readonly tenantId?: string;
  readonly shopperId?: string;
  readonly productId?: string;
  /** Override the inline person-image base64; defaults to the valid 1x1 PNG. */
  readonly personBase64?: string;
  /** Override the declared mime; defaults to image/png. */
  readonly personMime?: string;
}

/** Build a JSON-serialisable try-on request body with valid defaults. */
export function buildTryOnBody(options: TryOnBodyOptions = {}): Record<string, unknown> {
  return {
    tenantId: options.tenantId ?? DEMO_TENANT,
    shopperId: options.shopperId ?? 'shopper-1',
    productId: options.productId ?? 'product-1',
    personImage: {
      kind: 'base64',
      mimeType: options.personMime ?? 'image/png',
      data: options.personBase64 ?? VALID_PNG_1X1_BASE64,
    },
  };
}

/** Build a POST Request with a JSON body and an optional bearer token. */
export function buildPostRequest(body: unknown, token: string | undefined, url = 'https://api.test/v1/tryons'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', origin: 'https://shop.test' };
  if (token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** Build a POST Request that also carries an `idempotency-key` header (cost-control replay). */
export function buildIdempotentPostRequest(
  body: unknown,
  token: string,
  idempotencyKey: string,
  url = 'https://api.test/v1/tryons',
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    origin: 'https://shop.test',
    Authorization: `Bearer ${token}`,
    'idempotency-key': idempotencyKey,
  };
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** Build a GET Request with an optional bearer token and origin (for CORS assertions). */
export function buildGetRequest(
  url: string,
  token?: string,
  origin = 'https://shop.test',
): Request {
  const headers: Record<string, string> = { origin };
  if (token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return new Request(url, { method: 'GET', headers });
}

/** Build an OPTIONS preflight Request. */
export function buildOptionsRequest(url: string, origin = 'https://shop.test'): Request {
  return new Request(url, { method: 'OPTIONS', headers: { origin } });
}
