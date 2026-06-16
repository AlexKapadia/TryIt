import { test, expect } from '@playwright/test';
import {
  validPngBuffer,
  inWidget,
  collectConsoleErrors,
  gotoProduct,
  openAndConsent,
} from './support/fixtures';

/**
 * tryon-happy.spec — the full, real try-on round-trip in a live browser.
 *
 * Drives the embedded `<tryit-widget>` end to end against the REAL API and its offline
 * DeterministicProvider: open → accept consent → upload a synthetic valid PNG → the storefront's
 * orchestrator creates the job, polls, and feeds the outcome back → the widget advances
 * uploading → processing → result, showing a real result image. It also asserts the running app
 * logged no error-severity console messages while completing the flow.
 */

test.describe('try-on happy path', () => {
  test('upload advances through to a result with no console errors', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await gotoProduct(page);
    await openAndConsent(page);

    // Upload a synthetic, valid in-memory PNG via the real file input.
    await inWidget(page, 'input[type="file"]').setInputFiles({
      name: 'selfie.png',
      mimeType: 'image/png',
      buffer: validPngBuffer(),
    });

    // Staging enables the submit button (it is disabled until a photo is staged).
    const submit = inWidget(page, '[data-action="submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    // The flow talks to the real API; the DeterministicProvider always returns a result. The
    // transient uploading/processing screens may pass quickly, so we assert the terminal result.
    const result = inWidget(page, '[data-result="true"]');
    await expect(result).toBeVisible({ timeout: 20_000 });

    // The result image carries a real, renderable inline image source from the API job result.
    const src = await result.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src ?? '').toMatch(/^data:image\//);

    // ...and it actually DECODED and RENDERED in the browser (not a broken / non-resolvable image):
    // a loaded <img> reports complete === true and a non-zero intrinsic width.
    await expect
      .poll(
        () =>
          result.evaluate(
            (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // The widget's terminal result screen offers its real recovery + cart controls.
    await expect(inWidget(page, '[data-action="add-to-cart"]')).toBeVisible();
    await expect(inWidget(page, '[data-action="retry"]')).toBeVisible();

    // The live app produced ZERO error-severity console output during a successful try-on. The
    // offline DeterministicProvider now returns a renderable inline data: image, so there is no
    // non-resolvable host and no resource-load failure to excuse — every error (thrown exceptions,
    // failed API calls, hydration errors, broken images) must be absent.
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('the result "Add to cart" control drops the item into the bag', async ({ page }) => {
    await gotoProduct(page);
    await openAndConsent(page);

    await inWidget(page, 'input[type="file"]').setInputFiles({
      name: 'selfie.png',
      mimeType: 'image/png',
      buffer: validPngBuffer(),
    });
    await inWidget(page, '[data-action="submit"]').click();

    await expect(inWidget(page, '[data-result="true"]')).toBeVisible({ timeout: 20_000 });

    // The widget emits tryit:addtocart; the storefront listener adds the product to the bag.
    await inWidget(page, '[data-action="add-to-cart"]').click();
    await expect(page.getByTestId('cart-badge')).toHaveText(/\d+/);
  });
});
