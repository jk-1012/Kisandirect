import { test, expect } from '@playwright/test';

test.describe('Buyer Purchase Journey', () => {
  test('full buy now flow opens Razorpay widget', async ({ page }) => {
    // NOTE: replace `loginAsBuyer` with your test fixture or seed data if not available
    // await loginAsBuyer(page);

    // Navigate to a seeded test listing; update the listing id as necessary for your environment
    await page.goto('/listings/LST-20260521-000001');

    // Listing detail page loads
    await expect(page.locator('[data-testid="listing-price"]')).toBeVisible();
    await expect(page.locator('[data-testid="mandi-comparison"]')).toBeVisible();

    // Click Buy Now
    await page.locator('[data-testid="buy-now-btn"]').click();

    // Quantity input modal
    await page.locator('[data-testid="order-quantity"]').fill('50');
    await page.locator('[data-testid="confirm-order-btn"]').click();

    // Razorpay widget should open (in test mode it auto-succeeds)
    await expect(page.frameLocator('#razorpay-checkout-frame').locator('body')).toBeVisible({ timeout: 10000 });
  });
});
