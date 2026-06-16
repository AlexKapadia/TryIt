/**
 * app/_lib/tryitApi.ts — browser-side helpers that connect the storefront to the TryIt API.
 *
 * This module is the host-page glue between the embedded `<tryit-widget>` and the try-on service.
 * The widget element is a pure state machine + UI; it does NOT call the network itself. The host
 * (the retailer storefront) is responsible for: obtaining a publishable credential, and driving
 * the job lifecycle (create job → poll → feed the outcome back into the widget). That keeps secrets
 * and orchestration on the host and the widget tiny and framework-free.
 *
 * Everything here is defensive: the API base comes from an env var with a localhost default, every
 * response is shape-checked before it is trusted, and a credential/network failure fails closed to
 * a typed error the widget can render — never an unhandled rejection.
 */

/** The API base URL. Configurable per environment; defaults to the local dev API. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_TRYIT_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001';

/** A dev credential the storefront uses to authenticate try-on calls (dev-only endpoint). */
export interface DemoCredential {
  readonly tenantId: string;
  readonly apiKey: string;
}

/** Narrow an unknown payload to a {@link DemoCredential} (fail closed on any other shape). */
function isDemoCredential(value: unknown): value is DemoCredential {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.tenantId === 'string' && typeof record.apiKey === 'string';
}

/**
 * GET a working demo credential from the dev-only endpoint. Returns `null` (never throws) on any
 * failure so the caller can surface an UNAUTHORIZED-style shell error rather than crashing.
 */
export async function fetchDemoCredential(): Promise<DemoCredential | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/dev/credentials`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    return isDemoCredential(body) ? body : null;
  } catch {
    // Network/CORS/parse failure — fail closed (no credential, no try-on).
    return null;
  }
}

/** The image MIME types the try-on contract accepts for an inline payload. */
export type AllowedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Narrow an arbitrary blob MIME type to the allow-listed set, defaulting to jpeg. */
function toAllowedMimeType(mimeType: string): AllowedImageMimeType {
  if (mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType;
  }
  // jpeg is the safe default; the API re-validates the payload regardless.
  return 'image/jpeg';
}

/** The inline base64 image-reference shape the TryOn request body carries for the selfie. */
export interface Base64ImageRef {
  readonly kind: 'base64';
  readonly mimeType: AllowedImageMimeType;
  readonly data: string;
}

/**
 * Convert a blob (the shopper's staged selfie, read back from its object URL) into the inline
 * base64 ImageRef shape the TryOn contract expects. The widget validated the file client-side
 * already (jpeg/png/webp, ≤8MB), so we only need to encode and narrow the MIME type here.
 */
export async function blobToBase64ImageRef(blob: Blob): Promise<Base64ImageRef> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return { kind: 'base64', mimeType: toAllowedMimeType(blob.type), data: base64 };
}
