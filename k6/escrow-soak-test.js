// k6/escrow-soak-test.js — 24-hour soak test for payment pipeline

export const soakOptions = {
  stages: [
    { duration: '5m', target: 20 },
    { duration: '24h', target: 20 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.005'],  // <0.5% on payment endpoints
  },
};

// This script is intentionally minimal; implement payment flows by importing http and calling
// the same endpoints used in integration tests (orders -> webhook -> dispatch -> delivery).
// Keep credentials and secrets out of the script; supply via environment variables.
