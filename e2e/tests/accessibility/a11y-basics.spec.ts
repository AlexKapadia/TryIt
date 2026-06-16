import { test, expect } from '@playwright/test';
import { widget, inWidget, gotoProduct } from '../support/fixtures';

/**
 * a11y-basics.spec — basic accessibility checks on the live UI: key controls are reachable by
 * role with an accessible name and are keyboard-focusable. This is the floor (§4.9 names the full
 * WCAG 2.2 AA bar); these assertions catch missing roles/labels and dead-to-keyboard controls.
 */

test.describe('accessibility basics', () => {
  test('storefront key controls have roles and accessible names', async ({ page }) => {
    await page.goto('/');

    // The bag button is reachable by role with a descriptive name.
    await expect(page.getByRole('button', { name: /Open bag/i })).toBeVisible();
    // The hero heading is a real h1.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Brand link home has an accessible name.
    await expect(page.getByRole('link', { name: /ATELIER/i }).first()).toBeVisible();
  });

  test('product detail size buttons are real radios and keyboard-focusable', async ({ page }) => {
    await page.goto('/product/oxford-shirt');

    const radios = page.getByRole('radio');
    await expect(radios.first()).toBeVisible();

    // The add-to-bag control is keyboard-focusable.
    const addToBag = page.getByTestId('add-to-bag');
    await addToBag.focus();
    await expect(addToBag).toBeFocused();
  });

  test('the widget launcher exposes an accessible name', async ({ page }) => {
    await gotoProduct(page);
    await widget(page).waitFor({ state: 'attached', timeout: 15_000 });

    // The floating launcher is a button with a photo-aware accessible name.
    const launcher = inWidget(page, '[data-action="open"]');
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-label', /Try it on/i);

    // It is keyboard-focusable and opens the consent dialog.
    await launcher.focus();
    await expect(launcher).toBeFocused();
    await launcher.click();
    await expect(inWidget(page, '[role="dialog"]')).toBeVisible();
  });
});
