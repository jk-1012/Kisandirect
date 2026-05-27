Test Suite for KisanDirect

Overview:
- Playwright (E2E): tests/e2e
- Jest + supertest (unit/integration): backend/src/__tests__
- MSW mocks: tests/mocks/handlers.ts
- K6 load tests: k6/listings_search_test.js
- Test DB: docker-compose.test.yml (Postgres 16)

Critical rules:
- Never run tests against production. Set NODE_ENV=test and use TEST_DATABASE_URL.
- Escrow tests must use Razorpay test keys only. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to test credentials in CI only.
- Amounts must be asserted in paise (integers). Do not use floats.

Quick start (local):
1. Start test Postgres:

```bash
docker-compose -f docker-compose.test.yml up -d
```

2. Run migrations against the test DB (example using backend scripts):

```bash
# from repo root
cd backend
npm install
# Example migration runner; adjust if your project uses a different command
npm run migrate -- --db-url "$TEST_DATABASE_URL"
```

3. Run Jest tests:

```bash
export NODE_ENV=test
export TEST_DATABASE_URL=postgresql://test:test@localhost:5433/kisandirect_test
npm --prefix backend test
```

4. Run Playwright E2E (requires app server running pointing at TEST_DATABASE_URL):

```bash
export TEST_BASE_URL=http://localhost:3000
npx playwright test tests/e2e
```

5. Run K6 load test:

```bash
TARGET_BASE_URL=http://localhost:3000 k6 run k6/listings_search_test.js
```

Notes:
- The test suite expects the application to expose a test-only endpoint `_test/get-latest-otp` for retrieving OTPs issued to a test phone. This endpoint MUST be protected and only enabled in test environments.
- MSW handlers are provided for fast feedback in unit/integration tests. Playwright E2E may either use the real test services or the app should provide toggles to enable stubs.
