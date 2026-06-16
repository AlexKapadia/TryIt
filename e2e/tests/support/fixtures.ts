/**
 * Shared E2E support — synthetic in-memory fixtures and small helpers reused across specs.
 *
 * Nothing here touches disk or the network: the image payloads are tiny, valid byte buffers
 * generated in-process (synthetic-fixtures-only, §5.5), the widget locator centralises how we
 * pierce the open shadow DOM, and the console-error collector lets the happy-path spec assert the
 * real running app logged no error-severity console messages while completing a try-on.
 */

import type { Page, Locator } from '@playwright/test';

/**
 * A genuine, minimal valid 1x1 PNG (signature + IHDR + IDAT + IEND). It passes the API's
 * magic-byte sniff AND its IHDR dimension parse, so the real DeterministicProvider accepts it and
 * returns a succeeded job — exactly what the happy-path flow needs from a real upload.
 */
const VALID_PNG_HEX =
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000d49444154789c6360000002000100ffff03000006000557bfaa70' +
  '0000000049454e44ae426082';

/** Build the valid PNG as a Node Buffer for `setInputFiles`. */
export function validPngBuffer(): Buffer {
  return Buffer.from(VALID_PNG_HEX, 'hex');
}

/**
 * A deliberately invalid "image": a text/plain payload with a disallowed MIME type. The widget's
 * client-side `validateChosenFile` must reject it (INVALID_INPUT) before any upload, driving the
 * widget into its error state — this is the fail-closed edge the edge spec asserts.
 */
export function invalidFileBuffer(): Buffer {
  return Buffer.from('this is not an image at all', 'utf8');
}

/** The `<tryit-widget>` custom element host on a product page. */
export function widget(page: Page): Locator {
  return page.locator('[data-testid="tryit-widget"]');
}

/**
 * A locator inside the widget's OPEN shadow root. Playwright pierces open shadow DOM automatically
 * with CSS, so this is just a scoped CSS query from the widget host.
 */
export function inWidget(page: Page, selector: string): Locator {
  return widget(page).locator(selector);
}

/** Collect console messages of severity `error` while a flow runs, for a no-errors assertion. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

/** Navigate to a product detail page and wait for its interactive island to hydrate. */
export async function gotoProduct(page: Page, id = 'oxford-shirt'): Promise<void> {
  await page.goto(`/product/${id}`);
  // The try-on host is rendered by the client island; its presence confirms hydration started.
  await page.locator('[data-testid="tryon-host"]').waitFor({ state: 'attached' });
}

/**
 * Open the widget and accept consent, leaving it on the upload screen with the file input present.
 * Centralised because three specs need to reach the upload screen the same way.
 */
export async function openAndConsent(page: Page): Promise<void> {
  // The widget mounts after a browser-only dynamic import + a credential fetch; wait for it.
  await widget(page).waitFor({ state: 'attached', timeout: 15_000 });
  await inWidget(page, '[data-action="open"]').click();
  await inWidget(page, '[data-action="consent-accept"]').click();
  await inWidget(page, 'input[type="file"]').waitFor({ state: 'attached' });
}
