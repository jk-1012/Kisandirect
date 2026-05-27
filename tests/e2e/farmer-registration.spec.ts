import { test, expect } from '@playwright/test'

test('Farmer registration + KYC (Playwright)', async ({ page, request }) => {
  await page.goto('/register/farmer')
  await page.fill('input[name="name"]', 'Test Farmer')
  await page.fill('input[name="phone"]', '9888888888')
  await page.fill('input[name="email"]', 'farmer@example.com')

  // upload KYC document (use a small fixture image provided by test runner)
  const filePath = require('path').resolve(__dirname, '../fixtures/id.jpg')
  await page.setInputFiles('input[type="file"]', filePath)

  await page.click('button:has-text("Submit")')

  // Wait for KYC verification which is mocked in tests via DigiLocker/Vision MSW
  await page.waitForSelector('text=KYC Verified', { timeout: 15000 })
  await expect(page.getByText('Profile')).toBeVisible()
})
