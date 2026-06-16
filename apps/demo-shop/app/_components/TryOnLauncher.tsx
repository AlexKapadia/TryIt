'use client';

/**
 * TryOnLauncher — embeds the framework-free `<tryit-widget>` for a single product and wires it to
 * the storefront and the TryIt API.
 *
 * SSR-safety: the widget is a custom element that touches `window`/`customElements` at import time
 * (it auto-registers on import). It must therefore load BROWSER-ONLY. We never import it at module
 * scope; instead a `useEffect` imports it after mount, registering the element and unblocking
 * render. Before it loads we render a styled, accessible fallback trigger so there is never a dead
 * or empty control.
 *
 * Orchestration: the widget owns its own UI/state machine and emits `tryit:result`/`tryit:error`/
 * `tryit:addtocart`. It does NOT call the network — so this component watches the element for the
 * `uploading` state and drives the job lifecycle (create → poll → feed back) via the orchestrator,
 * and listens for `tryit:addtocart` to drop the item in the bag. No dead handlers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCart } from './CartProvider';
import { type Product } from '../_data/products';
import { fetchDemoCredential, type DemoCredential } from '../_lib/tryitApi';
import { runTryOn, type WidgetLike } from '../_lib/tryOnOrchestrator';
import type { createApiClient as CreateApiClientFn } from '@tryit/widget';
import styles from './TryOnLauncher.module.css';

/** A stable, per-session shopper id (synthetic — no PII). */
function makeShopperId(): string {
  return `demo-shopper-${Math.random().toString(36).slice(2, 10)}`;
}

export function TryOnLauncher({ product }: { product: Product }) {
  const { addItem } = useCart();
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLElement | null>(null);
  const credentialRef = useRef<DemoCredential | null>(null);
  const createApiClientRef = useRef<typeof CreateApiClientFn | null>(null);
  const shopperIdRef = useRef<string>(makeShopperId());
  const runningRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Drive the async job whenever the widget enters `uploading`. Guarded so one submit runs once.
  const maybeRunJob = useCallback(
    (widget: WidgetLike) => {
      if (widget.currentState.name !== 'uploading' || runningRef.current) {
        return;
      }
      const credential = credentialRef.current;
      const createApiClient = createApiClientRef.current;
      if (credential === null || createApiClient === null) {
        widget.send({ type: 'JOB_FAILED', errorCode: 'UNAUTHORIZED' });
        return;
      }
      runningRef.current = true;
      void runTryOn({
        widget,
        credential,
        productId: product.id,
        shopperId: shopperIdRef.current,
        createApiClient,
      }).finally(() => {
        runningRef.current = false;
      });
    },
    [product.id],
  );

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    // Browser-only dynamic import: registers <tryit-widget> without ever running during SSR,
    // and captures the validated API-client factory from the same (browser-only) module.
    void import('@tryit/widget').then(async (mod) => {
      if (cancelled || hostRef.current === null) {
        return;
      }
      createApiClientRef.current = mod.createApiClient;
      const credential = await fetchDemoCredential();
      if (cancelled) {
        return;
      }
      credentialRef.current = credential;
      if (credential === null) {
        // No working credential → the try-on shell is unavailable (UNAUTHORIZED-style dead end).
        setUnavailable(true);
        setReady(true);
        return;
      }

      const widget = document.createElement('tryit-widget') as HTMLElement & WidgetLike;
      widget.setAttribute('data-product-id', product.id);
      widget.setAttribute('data-testid', 'tryit-widget');

      // The widget emits these host-facing events; we react to each one (no dead listeners).
      widget.addEventListener('tryit:addtocart', () => {
        addItem(product, product.sizes[0]);
      });
      // After every internal transition the element re-renders synchronously; poll the state on
      // a microtask cadence to detect entry into `uploading` and kick off the network job.
      widget.addEventListener('click', () => queueMicrotask(() => maybeRunJob(widget)));
      widget.addEventListener('keydown', () => queueMicrotask(() => maybeRunJob(widget)));

      host.appendChild(widget);
      widgetRef.current = widget;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (widgetRef.current !== null) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
    };
  }, [product, addItem, maybeRunJob]);

  return (
    <div className={styles.wrap}>
      <div ref={hostRef} className={styles.host} data-testid="tryon-host" />
      {!ready ? (
        <button type="button" className={styles.fallback} disabled aria-busy="true">
          Loading try-on…
        </button>
      ) : null}
      {unavailable ? (
        <p className={styles.unavailable} role="status" data-testid="tryon-unavailable">
          Try-on isn’t available right now. You can still add this piece to your bag.
        </p>
      ) : null}
    </div>
  );
}
