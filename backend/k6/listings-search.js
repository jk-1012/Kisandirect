import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 500,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1500', 'avg<1200'],
    http_req_failed: ['rate<0.05']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1/listings/search';
const queries = [
  'q=tomato&state=KA&grade=A&sort=recency&limit=20',
  'q=rice&district=Hassan&price_min=15&price_max=40&limit=20',
  'lat=12.9716&lng=77.5946&radius_km=50&sort=proximity&limit=20',
  'crop_category=VEGETABLES&organic=true&sort=price_asc&limit=20',
  'q=potato&sort=trust_score&limit=20'
];

export default function () {
  const query = queries[Math.floor(Math.random() * queries.length)];
  const url = `${BASE_URL}?${query}`;
  const res = http.get(url);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1.5s': (r) => r.timings.duration < 1500
  });

  sleep(1);
}
