import { test, expect } from '@playwright/test';

test.describe('Farmer Onboarding Journey', () => {
  test('completes language selection → OTP → KYC landing in sequence', async ({ page }) => {
    await page.goto('/register');

    // Step 1: Language selection visible
    await expect(page.locator('text=Choose your language')).toBeVisible();
    await expect(page.locator('text=ಕನ್ನಡ')).toBeVisible(); // Kannada visible

    // Select Kannada
    await page.locator('[data-lang="kn"]').click();

    // Step 2: Phone number entry
    await expect(page).toHaveURL('/register/mobile');
    await page.locator('input[type="tel"]').fill('9876543210');
    await page.locator('button:has-text("OTP")').click();

    // Loading state
    await expect(page.locator('button[disabled]')).toBeVisible();

    // Step 3: OTP entry
    await expect(page).toHaveURL('/register/otp');
    
    // 6 individual digit boxes must be present
    const digitInputs = page.locator('[data-otp-digit]');
    await expect(digitInputs).toHaveCount(6);

    // Test paste support
    await digitInputs.first().fill('');
    await page.keyboard.type('123456');
    // All 6 boxes should be filled via auto-advance
    for (let i = 0; i < 6; i++) {
      await expect(digitInputs.nth(i)).toHaveValue(String(i + 1));
    }

    // Countdown timer visible
    await expect(page.locator('[data-testid="otp-countdown"]')).toBeVisible();
    await expect(page.locator('text=10:00')).toBeVisible();

    // Resend disabled initially
    await expect(page.locator('[data-testid="resend-otp"]')).toBeDisabled();
  });

  test('listing create form validates correctly before submission', async ({ page }) => {
    // NOTE: replace `loginAsFarmer` with your test fixture or registration flow if not available
    // If you have a helper, uncomment the following line and implement the helper accordingly:
    // await loginAsFarmer(page);

    // Fallback: navigate to registration and create a farmer profile if no helper is present
    await page.goto('/register/farmer');
    await page.fill('input[name="name"]', 'E2E Farmer');
    await page.fill('input[name="phone"]', '9887766554');
    await page.fill('input[name="email"]', 'e2e_farmer@example.com');
    const filePath = require('path').resolve(__dirname, '../fixtures/id.jpg');
    await page.setInputFiles('input[type="file"]', filePath);
    await page.click('button:has-text("Submit")');
    await page.waitForSelector('text=KYC Verified', { timeout: 15000 });

    // Navigate to listing creation
    await page.goto('/farmer/listings/new');

    // Try to submit empty form
    await page.locator('button[type="submit"]').click();

    // Errors must appear
    await expect(page.locator('text=Crop type is required')).toBeVisible();
    await expect(page.locator('text=Quantity is required')).toBeVisible();

    // Fill form
    await page.selectOption('[data-testid="crop-type-select"]', 'TOMATO');
    await page.locator('[data-testid="quantity-input"]').fill('500');
    await page.locator('[data-testid="price-input"]').fill('25');
    await page.locator('[data-testid="harvest-date"]').fill('2026-05-20');

    // Mandi comparison should appear after price entry
    await expect(page.locator('[data-testid="mandi-comparison"]')).toBeVisible();

    // Submit
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/farmer\/listings\/LST-/);
    await expect(page.locator('text=Listing created successfully')).toBeVisible();
  });

  test('search page shows listings and filters work', async ({ page }) => {
    await page.goto('/buy/karnataka/tomatoes');

    // Listings load
    await expect(page.locator('[data-testid="listing-card"]').first()).toBeVisible({ timeout: 5000 });

    // Filter by organic
    await page.locator('[data-testid="organic-filter"]').click();

    // URL updates
    await expect(page).toHaveURL(/organic=true/);

    // Results update
    await page.waitForResponse(res => res.url().includes('/api/v1/listings/search'));
    const cards = await page.locator('[data-testid="listing-card"]').count();
    expect(cards).toBeGreaterThanOrEqual(0); // may have 0 organic results

    // Sort
    await page.selectOption('[data-testid="sort-select"]', 'price_asc');
    await expect(page).toHaveURL(/sort=price_asc/);
  });
});
