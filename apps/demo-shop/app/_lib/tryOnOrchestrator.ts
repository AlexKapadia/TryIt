/**
 * app/_lib/tryOnOrchestrator.ts — drives the async try-on job lifecycle on behalf of the widget.
 *
 * The `<tryit-widget>` element is a pure state machine: when the shopper submits, it moves itself
 * to the `uploading` state and then WAITS for the host to feed it job outcomes via `send()`. This
 * orchestrator is that host driver. Given a widget element that has just entered `uploading`, it:
 *
 *   1. reads back the staged selfie (from its preview object URL) and encodes it as base64,
 *   2. POSTs a TryOnRequest to create a job,
 *   3. polls the job until it reaches a terminal status,
 *   4. and `send()`s the matching machine event (`JOB_CREATED`/`JOB_SUCCEEDED`/`JOB_FAILED`).
 *
 * Every failure path is mapped to a typed `ErrorCode` and surfaced via `JOB_FAILED` so the widget
 * shows the right recovery — it never leaves the widget stuck in `uploading`. The widget client
 * (`createApiClient`) is reused so request/response validation lives in one tested place.
 */

import type { TryOnApiClient, WidgetEvent } from '@tryit/widget';
import { blobToBase64ImageRef, type DemoCredential, API_BASE_URL } from './tryitApi';

/**
 * Type-only import of the widget here keeps this module server-safe: importing `@tryit/widget` as
 * a VALUE would evaluate its `class extends HTMLElement` and `customElements.define` at load time,
 * which throws during SSR. The browser-only `createApiClient` factory is therefore INJECTED by the
 * caller (which dynamic-imports the widget) rather than imported at module scope.
 */
type CreateApiClient = (config: {
  baseUrl: string;
  publishableKey: string;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}) => TryOnApiClient;

/**
 * The try-on request body shape, derived from the widget API client so we never take a direct
 * dependency on `@tryit/contracts` from the storefront — the widget is the single integration
 * surface. (The full schema/validation still lives in contracts, enforced inside the client.)
 */
type TryOnRequest = Parameters<TryOnApiClient['createTryOn']>[0];

/** The subset of the widget element this orchestrator needs. */
export interface WidgetLike {
  readonly currentState: { name: string; photo?: { previewUrl: string } };
  send: (event: WidgetEvent) => void;
}

/** Inputs needed to run one try-on for a given product. */
export interface OrchestrationContext {
  readonly widget: WidgetLike;
  readonly credential: DemoCredential;
  readonly productId: string;
  readonly shopperId: string;
  /** Browser-only factory for the widget's validated API client, injected to keep SSR safe. */
  readonly createApiClient: CreateApiClient;
}

const POLL_INTERVAL_MS = 1200;
const MAX_POLLS = 50; // ~60s ceiling before we fail closed with a provider error.

/** Read the staged selfie back from its object URL and encode it for the request body. */
async function buildPersonImage(previewUrl: string): Promise<TryOnRequest['personImage']> {
  const response = await fetch(previewUrl);
  const blob = await response.blob();
  return blobToBase64ImageRef(blob);
}

/**
 * Run the full create-and-poll cycle for a widget that has entered `uploading`. Resolves once a
 * terminal event has been sent into the widget. Safe to call once per submit; it always drives
 * the widget to a terminal state (result or error) and never throws.
 */
export async function runTryOn(ctx: OrchestrationContext): Promise<void> {
  const { widget, credential, productId, shopperId, createApiClient } = ctx;
  const photo = widget.currentState.photo;
  if (photo === undefined) {
    // No staged photo means there is nothing to submit — fail closed.
    widget.send({ type: 'JOB_FAILED', errorCode: 'INVALID_INPUT' });
    return;
  }

  const client = createApiClient({
    baseUrl: API_BASE_URL,
    publishableKey: credential.apiKey,
    fetch: (input, init) => fetch(input, init),
  });

  let personImage: TryOnRequest['personImage'];
  try {
    personImage = await buildPersonImage(photo.previewUrl);
  } catch {
    widget.send({ type: 'JOB_FAILED', errorCode: 'INVALID_INPUT' });
    return;
  }

  const request: TryOnRequest = {
    tenantId: credential.tenantId,
    shopperId,
    productId,
    category: 'apparel',
    personImage,
  };

  const created = await client.createTryOn(request);
  if (!created.ok) {
    widget.send({ type: 'JOB_FAILED', errorCode: created.code });
    return;
  }

  widget.send({ type: 'JOB_CREATED', jobId: created.value.jobId });

  // A cached result can already be terminal on creation — handle it before polling.
  if (settleIfTerminal(widget, created.value)) {
    return;
  }

  await pollUntilTerminal(client, widget, created.value.jobId);
}

/** Poll a job id until it terminates or the poll ceiling is hit (fail closed on timeout). */
async function pollUntilTerminal(
  client: TryOnApiClient,
  widget: WidgetLike,
  jobId: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);
    const polled = await client.getJob(jobId);
    if (!polled.ok) {
      widget.send({ type: 'JOB_FAILED', errorCode: polled.code });
      return;
    }
    if (settleIfTerminal(widget, polled.value)) {
      return;
    }
  }
  // No terminal status within the ceiling — surface a retryable provider error.
  widget.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
}

/**
 * If the job is terminal, send the matching event and return true; otherwise return false so the
 * caller keeps polling. A succeeded job without a result url is treated as a provider failure.
 */
function settleIfTerminal(
  widget: WidgetLike,
  job: { status: string; result?: { resultImageUrl: string } },
): boolean {
  if (job.status === 'succeeded') {
    const url = job.result?.resultImageUrl;
    if (typeof url === 'string' && url.length > 0) {
      widget.send({ type: 'JOB_SUCCEEDED', resultUrl: url });
    } else {
      widget.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
    }
    return true;
  }
  if (job.status === 'failed') {
    widget.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
    return true;
  }
  return false;
}

/** Promise-based delay used between polls. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
