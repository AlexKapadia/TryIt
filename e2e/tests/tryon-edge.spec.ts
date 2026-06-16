import { test, expect } from '@playwright/test';
import {
  validPngBuffer,
  invalidFileBuffer,
  widget,
  inWidget,
  gotoProduct,
  openAndConsent,
} from './support/fixtures';

/**
 * tryon-edge.spec — the privacy and failure edges of the try-on, proven live.
 *
 * Declining consent must fail closed: no file input is ever reachable, so no photo can be uploaded
 * before explicit consent. An invalid file type must be rejected client-side into the widget's
 * error state (never uploaded). And a retry from that error must return the widget to a usable
 * upload screen so the shopper can recover.
 */

test.describe('try-on edges', () => {
  test('declining consent fails closed — the file input is never reachable', async ({ page }) => {
    await gotoProduct(page);
    await widget(page).waitFor({ state: 'attached', timeout: 15_000 });

    await inWidget(page, '[data-action="open"]').click();
    // There must be NO file input on the consent screen — upload is gated behind consent.
    await expect(inWidget(page, 'input[type="file"]')).toHaveCount(0);

    // Decline returns to idle; the launcher comes back and still no file input exists.
    await inWidget(page, '[data-action="consent-decline"]').click();
    await expect(inWidget(page, '[data-action="open"]')).toBeVisible();
    await expect(inWidget(page, 'input[type="file"]')).toHaveCount(0);
  });

  test('an invalid file type is rejected into the error state, never uploaded', async ({ page }) => {
    await gotoProduct(page);
    await openAndConsent(page);

    // A text/plain payload is not an allowed image — the client gate rejects it.
    await inWidget(page, 'input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: invalidFileBuffer(),
    });

    // The widget moves to its error state (role="alert"), and offers a recovery control.
    await expect(inWidget(page, '[role="alert"]')).toBeVisible();
    await expect(inWidget(page, '.ti-title')).toContainText(/went wrong/i);
    // INVALID_INPUT recovery is a retry control.
    await expect(inWidget(page, '[data-action="retry"]')).toBeVisible();
  });

  test('retry from the rejection returns to a usable upload screen', async ({ page }) => {
    await gotoProduct(page);
    await openAndConsent(page);

    await inWidget(page, 'input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: invalidFileBuffer(),
    });
    await expect(inWidget(page, '[role="alert"]')).toBeVisible();

    // Retry preserves consent and lands back on the upload screen with a working file input.
    await inWidget(page, '[data-action="retry"]').click();
    const fileInput = inWidget(page, 'input[type="file"]');
    await expect(fileInput).toBeAttached();

    // And the recovered upload screen actually accepts a valid photo (fully usable again).
    await fileInput.setInputFiles({
      name: 'selfie.png',
      mimeType: 'image/png',
      buffer: validPngBuffer(),
    });
    await expect(inWidget(page, '[data-action="submit"]')).toBeEnabled();
  });

  test('Escape closes the open widget from a non-idle screen', async ({ page }) => {
    await gotoProduct(page);
    await widget(page).waitFor({ state: 'attached', timeout: 15_000 });
    await inWidget(page, '[data-action="open"]').click();

    // A keyboard user lands on a control inside the dialog; the widget's Esc handler is scoped to
    // its own subtree, so press Escape from a focused in-sheet control (realistic dialog usage).
    const close = inWidget(page, '[data-action="close"]');
    await close.focus();
    await close.press('Escape');

    // Escape returns to idle: the launcher reappears and the dialog is gone.
    await expect(inWidget(page, '[data-action="open"]')).toBeVisible();
    await expect(inWidget(page, '[role="dialog"]')).toHaveCount(0);
  });
});
