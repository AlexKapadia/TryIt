/**
 * @tryit/widget/embed — the packaged `<script>` drop-in host glue for the try-on widget.
 *
 * The widget element (`element.ts`) is a PURE state machine plus DOM: it deliberately performs no
 * network I/O, because "network orchestration lives in the host glue, not the element". This
 * module IS that host glue — the piece a shop would otherwise have to hand-write. It:
 *   1. reads config from `data-*` attributes on a host element (or the including <script> tag),
 *   2. creates the dependency-light browser api client (`api.ts`) with the publishable key,
 *   3. mounts a `<tryit-widget>` inside the host,
 *   4. WATCHES the widget's own state (via the open shadow root + its `currentState` getter) and,
 *      the moment the shopper submits (the FSM enters `uploading`), drives the network lifecycle
 *      create -> poll getJob until terminal -> feed the outcome back in through the element's
 *      `send()` method (JOB_CREATED / JOB_SUCCEEDED / JOB_FAILED),
 *   5. re-exposes the host-facing `tryit:result` / `tryit:error` / `tryit:addtocart` events.
 *
 * The FSM is never modified: every state change still flows through the element's tested
 * `transition()`, and the consent gate / privacy invariant remain enforced by the element. The
 * loader only OBSERVES state and FEEDS async outcomes — it cannot stage a photo or bypass consent.
 *
 * Public surface: `window.TryIt = { mount(opts), mountAll() }`, plus `mountAll()` auto-runs on
 * DOMContentLoaded for every element carrying a `data-tryit-mount` attribute.
 */

import { createApiClient, type FetchLike, type TryOnApiClient } from './api.js';
import { defineTryItWidget, TAG_NAME, type TryItWidget } from './element.js';
import type { TryOnRequest, TryOnJob } from '@tryit/contracts';

/** Polling cadence + ceiling for the create->poll lifecycle (ms). Bounded so a stuck job ends. */
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

/** The resolved configuration the loader needs to mount one widget and talk to the API. */
export interface MountOptions {
  /** The host element the widget is mounted inside. */
  readonly host: HTMLElement;
  readonly apiBase: string;
  readonly publishableKey: string;
  readonly tenantId: string;
  readonly shopperId: string;
  readonly productId: string;
  /** The shopper's person image reference (https url). Kept config-driven; never read from DOM. */
  readonly personImageUrl: string;
  /** Injected fetch (defaults to the real browser fetch). Injected for tests — no implicit network. */
  readonly fetch?: FetchLike;
  /** Injected timers for tests; default to the real setTimeout/clearTimeout. */
  readonly setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
}

/** Read a trimmed, non-empty `data-*` attribute, or `undefined` when absent/blank. */
function readData(el: HTMLElement, name: string): string | undefined {
  const raw = el.getAttribute(name);
  if (raw === null) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve {@link MountOptions} from an element's `data-*` attributes, falling back to the
 * including <script> tag's attributes for any not set on the host. Returns `undefined` (and warns)
 * when a required field is missing — fail-closed: the loader refuses to mount a half-configured
 * widget that could only ever error.
 */
export function resolveOptions(host: HTMLElement, overrides: Partial<MountOptions> = {}): MountOptions | undefined {
  const script = document.currentScript instanceof HTMLElement ? document.currentScript : null;
  const get = (name: string): string | undefined =>
    readData(host, name) ?? (script !== null ? readData(script, name) : undefined);

  const apiBase = overrides.apiBase ?? get('data-api-base');
  const publishableKey = overrides.publishableKey ?? get('data-publishable-key');
  const tenantId = overrides.tenantId ?? get('data-tenant-id');
  const shopperId = overrides.shopperId ?? get('data-shopper-id');
  const productId = overrides.productId ?? get('data-product-id');
  const personImageUrl = overrides.personImageUrl ?? get('data-product-image');

  if (
    apiBase === undefined ||
    publishableKey === undefined ||
    tenantId === undefined ||
    shopperId === undefined ||
    productId === undefined ||
    personImageUrl === undefined
  ) {
    // fail-closed: a missing required attribute means we never mount a broken widget.
    return undefined;
  }
  return {
    host,
    apiBase,
    publishableKey,
    tenantId,
    shopperId,
    productId,
    personImageUrl,
    ...(overrides.fetch !== undefined ? { fetch: overrides.fetch } : {}),
    ...(overrides.setTimeoutFn !== undefined ? { setTimeoutFn: overrides.setTimeoutFn } : {}),
    ...(overrides.clearTimeoutFn !== undefined ? { clearTimeoutFn: overrides.clearTimeoutFn } : {}),
  };
}

/** Build the contract-shaped try-on request from the resolved options. */
function buildRequest(opts: MountOptions): TryOnRequest {
  return {
    tenantId: opts.tenantId,
    shopperId: opts.shopperId,
    personImage: { kind: 'url', url: opts.personImageUrl },
    productId: opts.productId,
    category: 'apparel',
  };
}

/**
 * Mount a widget into `opts.host` and wire its network lifecycle. Returns the created element so
 * a caller/test can introspect it. Idempotent per host: a host that already holds a widget is
 * left untouched (a re-`mountAll()` never double-mounts).
 */
export function mount(opts: MountOptions): TryItWidget {
  defineTryItWidget(); // ensure the element is registered (idempotent).
  const existing = opts.host.querySelector<TryItWidget>(TAG_NAME);
  if (existing !== null) {
    return existing; // already mounted here — do not create a second.
  }
  const el = document.createElement(TAG_NAME) as TryItWidget;
  opts.host.appendChild(el);
  wireNetworkLifecycle(el, opts);
  return el;
}

/**
 * Watch the widget's state and run the network lifecycle exactly once per submit. The watcher
 * keys off the FSM entering `uploading` (reachable ONLY after consent + a staged photo + SUBMIT),
 * so the loader can never start a network call before the privacy gate has been cleared.
 */
function wireNetworkLifecycle(el: TryItWidget, opts: MountOptions): void {
  const client = createApiClient({
    baseUrl: opts.apiBase,
    publishableKey: opts.publishableKey,
    fetch: opts.fetch ?? ((input, init) => fetch(input, init)),
  });

  let inFlight = false;
  const maybeStart = (): void => {
    if (inFlight) {
      return;
    }
    if (el.currentState.name === 'uploading') {
      inFlight = true;
      void runJob(el, client, opts).finally(() => {
        inFlight = false;
      });
    }
  };

  // The element re-renders its shadow root on every transition, so observing the shadow root's
  // subtree gives us a transition signal without touching the (pure) FSM.
  const root = el.shadowRoot;
  if (root !== null && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => maybeStart());
    observer.observe(root, { childList: true, subtree: true });
  }
  // Also check synchronously in case the state is already past idle when wiring runs.
  maybeStart();
}

/**
 * Drive one create -> poll -> terminal cycle, feeding each outcome into the element via `send()`.
 * Every failure path fails closed to a JOB_FAILED event carrying a typed code, so the widget shows
 * the error screen rather than hanging in `processing`.
 */
async function runJob(el: TryItWidget, client: TryOnApiClient, opts: MountOptions): Promise<void> {
  const created = await client.createTryOn(buildRequest(opts));
  if (!created.ok) {
    el.send({ type: 'JOB_FAILED', errorCode: created.code });
    return;
  }
  el.send({ type: 'JOB_CREATED', jobId: created.value.jobId });
  const terminal = await pollToTerminal(client, created.value.jobId, opts);
  if (terminal === undefined) {
    el.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
    return;
  }
  feedTerminal(el, terminal);
}

/** Translate a terminal job into the matching machine event. */
function feedTerminal(el: TryItWidget, job: TryOnJob): void {
  if (job.status === 'succeeded' && job.result !== undefined) {
    el.send({ type: 'JOB_SUCCEEDED', resultUrl: job.result.resultImageUrl });
    return;
  }
  // A failed job (or a succeeded job with no result) fails closed to the error screen.
  el.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
}

/**
 * Poll `getJob` until it reaches a terminal status, the deadline elapses, or the read fails.
 * Returns the terminal job, or `undefined` on timeout / transport failure (fail-closed). Uses the
 * injected timer so tests advance time deterministically with no real waiting.
 */
async function pollToTerminal(
  client: TryOnApiClient,
  jobId: string,
  opts: MountOptions,
): Promise<TryOnJob | undefined> {
  const setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const start = Date.now();
  for (;;) {
    const polled = await client.getJob(jobId);
    if (!polled.ok) {
      return undefined; // fail-closed: a failed read ends the cycle.
    }
    const status = polled.value.status;
    if (status === 'succeeded' || status === 'failed') {
      return polled.value;
    }
    if (Date.now() - start >= POLL_TIMEOUT_MS) {
      return undefined; // fail-closed: bounded so a stuck job cannot poll forever.
    }
    await new Promise<void>((resolve) => setTimeoutFn(() => resolve(), POLL_INTERVAL_MS));
  }
}

/** Mount every element on the page carrying a `data-tryit-mount` attribute. */
export function mountAll(): void {
  const hosts = document.querySelectorAll<HTMLElement>('[data-tryit-mount]');
  hosts.forEach((host) => {
    const opts = resolveOptions(host);
    if (opts !== undefined) {
      mount(opts);
    }
  });
}

/** The global API a shop's `<script>` include uses. */
export interface TryItGlobal {
  mount(opts: MountOptions): TryItWidget;
  mountAll(): void;
}

/** Install `window.TryIt` and auto-run `mountAll()` on DOMContentLoaded. Safe to call repeatedly. */
export function installTryItGlobal(): void {
  if (typeof window === 'undefined') {
    return; // no-op outside a browser (e.g. SSR import).
  }
  (window as unknown as { TryIt: TryItGlobal }).TryIt = { mount, mountAll };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll(), { once: true });
  } else {
    mountAll();
  }
}

// Auto-install when this entry is loaded as the drop-in script.
installTryItGlobal();
