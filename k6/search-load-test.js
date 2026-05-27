import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const searchDuration = new Trend('search_duration', true);

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // ramp up
    { duration: '5m', target: 500 },   // sustained 500 concurrent
    { duration: '2m', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'],  // P95 < 1.5s
    http_req_failed: ['rate<0.01'],     // <1% errors
    errors: ['rate<0.01'],
    search_duration: ['p(99)<2000'],    // P99 < 2s
  },
};

const CROP_TYPES = ['TOMATO', 'ONION', 'POTATO', 'BRINJAL', 'MANGO', 'RICE', 'WHEAT'];
const STATES = ['KA', 'MH', 'UP', 'TN', 'GJ'];
const SORTS = ['recency', 'price_asc', 'price_desc', 'trust_score'];

export default function () {
  const crop = CROP_TYPES[Math.floor(Math.random() * CROP_TYPES.length)];
  const state = STATES[Math.floor(Math.random() * STATES.length)];
  const sort = SORTS[Math.floor(Math.random() * SORTS.length)];

  const url = `${__ENV.API_BASE_URL}/api/v1/listings/search?crop_type=${crop}&state=${state}&sort=${sort}&limit=20`;

  const start = Date.now();
  const res = http.get(url, {
    headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip, br' },
    timeout: '10s',
  });
  searchDuration.add(Date.now() - start);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has results array': (r) => {
      try { return JSON.parse(r.body).results !== undefined } catch (e) { return false }
    },
    'response < 50KB': (r) => r.body.length < 50000,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!ok);
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}
