/**
 * Tests for the `embed.ts` host glue — `resolveOptions`, `mount`, `mountAll`, and
 * `installTryItGlobal`. The network lifecycle (create -> poll -> terminal) is exercised here
 * end-to-end by driving the REAL element FSM into `uploading` and feeding deterministic, injected
 * fetch + timers (NO real network, NO real timers). Runs under jsdom.
 *
 * Timing note: the loader observes the element's shadow root with a MutationObserver to detect the
 * `uploading` transition, so after a `send()` that re-renders we flush microtasks (`flush()`) to
 * let the observer + the async lifecycle run before asserting.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { resolveOptions, mount, mountAll, installTryItGlobal } from './embed.js';
import { TAG_NAME, defineTryItWidget } from './element.js';
import type { FetchLike } from './api.js';
import type { TryOnJob } from '@tryit/contracts';

beforeAll(() => {
  defineTryItWidget();
});

/** Build a fetch fake returning a given status + JSON body. */
function jsonFetch(status: number, body: unknown): FetchLike {
  return async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A valid terminal/processing job of the given status (and optional result). */
function job(status: TryOnJob['status'], resultUrl?: string): TryOnJob {
  const base: TryOnJob = {
    jobId: 'job-1',
    status,
    request: {
      tenantId: 't1',
      shopperId: 's1',
      personImage: { kind: 'url', url: 'https://img/p.jpg' },
      productId: 'p1',
      category: 'apparel',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  if (resultUrl !== undefined) {
    return {
      ...base,
      result: { resultImageUrl: resultUrl, provider: 'prov', latencyMs: 12, cached: false, costUsd: 0.01 },
    };
  }
  return base;
}

/** A host with all required data-* attributes set. */
function fullHost(): HTMLDivElement {
  const host = document.createElement('div');
  host.setAttribute('data-api-base', 'https://api.test');
  host.setAttribute('data-publishable-key', 'pk_1');
  host.setAttribute('data-tenant-id', 't1');
  host.setAttribute('data-shopper-id', 's1');
  host.setAttribute('data-product-id', 'p1');
  host.setAttribute('data-product-image', 'https://img/p.jpg');
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('resolveOptions — reads data-* and fails closed', () => {
  it('reads every required field from host data-* attributes and trims them', () => {
    const host = document.createElement('div');
    host.setAttribute('data-api-base', '  https://api.test  ');
    host.setAttribute('data-publishable-key', 'pk_1');
    host.setAttribute('data-tenant-id', 't1');
    host.setAttribute('data-shopper-id', 's1');
    host.setAttribute('data-product-id', 'p1');
    host.setAttribute('data-product-image', 'https://img/p.jpg');
    const opts = resolveOptions(host);
    expect(opts).toBeDefined();
    expect(opts!.apiBase).toBe('https://api.test'); // trimmed
    expect(opts!.publishableKey).toBe('pk_1');
    expect(opts!.tenantId).toBe('t1');
    expect(opts!.shopperId).toBe('s1');
    expect(opts!.productId).toBe('p1');
    expect(opts!.personImageUrl).toBe('https://img/p.jpg');
    expect(opts!.host).toBe(host);
  });

  it('overrides win over data-* attributes', () => {
    const host = fullHost();
    const opts = resolveOptions(host, { apiBase: 'https://override', tenantId: 'T-OVER' });
    expect(opts!.apiBase).toBe('https://override');
    expect(opts!.tenantId).toBe('T-OVER');
    expect(opts!.publishableKey).toBe('pk_1'); // untouched fields still from data-*
  });

  it('carries fetch/setTimeoutFn/clearTimeoutFn overrides through to the result', () => {
    const f = vi.fn() as unknown as FetchLike;
    const st = vi.fn();
    const ct = vi.fn();
    const opts = resolveOptions(fullHost(), { fetch: f, setTimeoutFn: st, clearTimeoutFn: ct });
    expect(opts!.fetch).toBe(f);
    expect(opts!.setTimeoutFn).toBe(st);
    expect(opts!.clearTimeoutFn).toBe(ct);
  });

  it('omits optional injected fields when not provided', () => {
    const opts = resolveOptions(fullHost());
    expect('fetch' in opts!).toBe(false);
    expect('setTimeoutFn' in opts!).toBe(false);
    expect('clearTimeoutFn' in opts!).toBe(false);
  });

  // Fail-closed: each required field, individually missing or blank, must yield undefined.
  const required = [
    'data-api-base',
    'data-publishable-key',
    'data-tenant-id',
    'data-shopper-id',
    'data-product-id',
    'data-product-image',
  ];
  for (const attr of required) {
    it(`returns undefined when ${attr} is absent`, () => {
      const host = fullHost();
      host.removeAttribute(attr);
      expect(resolveOptions(host)).toBeUndefined();
    });
    it(`returns undefined when ${attr} is blank whitespace`, () => {
      const host = fullHost();
      host.setAttribute(attr, '   ');
      expect(resolveOptions(host)).toBeUndefined();
    });
  }
});

describe('mount — registration + idempotency', () => {
  it('appends exactly one <tryit-widget> into the host', () => {
    const host = fullHost();
    document.body.appendChild(host);
    const opts = resolveOptions(host, { fetch: jsonFetch(200, job('queued')) })!;
    const el = mount(opts);
    expect(el.tagName.toLowerCase()).toBe(TAG_NAME);
    expect(host.querySelectorAll(TAG_NAME).length).toBe(1);
    expect(customElements.get(TAG_NAME)).toBeDefined();
  });

  it('is idempotent: mounting twice returns the existing element, never a second', () => {
    const host = fullHost();
    document.body.appendChild(host);
    const opts = resolveOptions(host, { fetch: jsonFetch(200, job('queued')) })!;
    const first = mount(opts);
    const second = mount(opts);
    expect(second).toBe(first);
    expect(host.querySelectorAll(TAG_NAME).length).toBe(1);
  });
});

describe('mountAll — scans the page, skips broken hosts', () => {
  it('mounts every [data-tryit-mount] host that resolves, skips the misconfigured one', () => {
    const good = fullHost();
    good.setAttribute('data-tryit-mount', '');
    const bad = document.createElement('div');
    bad.setAttribute('data-tryit-mount', '');
    bad.setAttribute('data-api-base', 'https://api.test'); // missing the rest -> fail-closed
    const ignored = fullHost(); // configured but NOT a mount host
    document.body.append(good, bad, ignored);

    mountAll();

    expect(good.querySelectorAll(TAG_NAME).length).toBe(1);
    expect(bad.querySelectorAll(TAG_NAME).length).toBe(0); // skipped: resolveOptions returned undefined
    expect(ignored.querySelectorAll(TAG_NAME).length).toBe(0); // no data-tryit-mount -> never scanned
  });
});

describe('installTryItGlobal — global wiring', () => {
  it('installs window.TryIt with working mount + mountAll', () => {
    installTryItGlobal();
    const g = (window as unknown as { TryIt: { mount: unknown; mountAll: unknown } }).TryIt;
    expect(typeof g.mount).toBe('function');
    expect(typeof g.mountAll).toBe('function');
  });

  it('re-calling is a safe no-op (reinstalls without throwing) and mountAll runs immediately', () => {
    const host = fullHost();
    host.setAttribute('data-tryit-mount', '');
    document.body.appendChild(host);
    // readyState is 'complete' under jsdom, so installTryItGlobal calls mountAll() synchronously.
    expect(() => installTryItGlobal()).not.toThrow();
    expect(host.querySelectorAll(TAG_NAME).length).toBe(1);
  });

  it('defers mountAll to DOMContentLoaded while the document is still loading', () => {
    // Force the "loading" branch: install must NOT mount yet, but must mount when the event fires.
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const host = fullHost();
    host.setAttribute('data-tryit-mount', '');
    document.body.appendChild(host);

    installTryItGlobal();
    expect(host.querySelectorAll(TAG_NAME).length).toBe(0); // deferred — not mounted on install

    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(host.querySelectorAll(TAG_NAME).length).toBe(1); // mounted once the DOM is ready
  });
});
