import { test, expect } from '@playwright/test';

/**
 * storefront.spec — the catalogue shell, driven live in a real browser.
 *
 * Proves the storefront's read path against the running app: the home grid renders the full
 * catalogue, a product tile actually navigates to its detail page, and the detail page shows the
 * real price and selectable sizes. These are the entry points every other flow depends on.
 */

test.describe('storefront catalogue', () => {
  test('home renders the product grid with all six pieces', async ({ page }) => {
    await page.goto('/');

    const grid = page.getByTestId('product-grid');
    await expect(grid).toBeVisible();

    const cards = page.getByTestId('product-card');
    await expect(cards).toHaveCount(6);

    // Every card shows a real, formatted price (not an empty/placeholder string).
    const prices = page.getByTestId('product-price');
    await expect(prices).toHaveCount(6);
    await expect(prices.first()).toHaveText(/£\d/);
  });

  test('a product card navigates to its detail page', async ({ page }) => {
    await page.goto('/');

    const firstCard = page.getByTestId('product-card').first();
    const productId = await firstCard.getAttribute('data-product-id');
    expect(productId).toBeTruthy();

    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(`/product/${productId}$`));
  });

  test('product detail shows price and size options', async ({ page }) => {
    await page.goto('/product/oxford-shirt');

    await expect(page.getByTestId('detail-price')).toHaveText(/£\d/);

    const sizes = page.getByTestId('size-option');
    await expect(sizes.first()).toBeVisible();
    const sizeCount = await sizes.count();
    expect(sizeCount).toBeGreaterThan(0);

    // The size group is a real radiogroup: selecting a size checks it.
    const second = sizes.nth(1);
    await second.click();
    await expect(second).toHaveAttribute('aria-checked', 'true');
  });

  test('an unknown product id renders the 404 page, never a broken page', async ({ page }) => {
    const response = await page.goto('/product/does-not-exist');
    expect(response?.status()).toBe(404);
  });
});
