import { test, expect } from '@playwright/test'

test('OTP auth flow (Playwright)', async ({ page, request }) => {
  // start on login page
  await page.goto('/auth/login')
  await page.fill('input[name="phone"]', '9999999999')
  await page.click('button:has-text("Send OTP")')

  // The backend uses MSG91 which is mocked by MSW in Jest; for Playwright we assume a test-only debug endpoint to fetch OTP
  // Retrieve OTP via test API (must be available only in test mode)
  const r = await request.get('/_test/get-latest-otp?phone=9999999999')
  expect(r.ok()).toBeTruthy()
  const body = await r.json()
  const otp = body.otp
  expect(otp).toMatch(/^[0-9]{4,6}$/)

  await page.fill('input[name="otp"]', otp)
  await page.click('button:has-text("Verify")')

  // after successful login, redirect to dashboard
  await page.waitForURL('/dashboard', { timeout: 10000 })
  await expect(page.getByText('Welcome')).toBeVisible()
})
