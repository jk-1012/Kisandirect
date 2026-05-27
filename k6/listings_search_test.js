import http from 'k6/http'
import { check, sleep } from 'k6'

export let options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
    },
  },
  thresholds: {
    'http_req_duration{endpoint:search}': ['p(95)<1500'],
    'http_req_duration': ['p(95)<1500']
  },
}

export default function () {
  const url = `${__ENV.TARGET_BASE_URL || 'http://localhost:3000'}/listings/search`
  const payload = JSON.stringify({ q: 'mango', page: 1, perPage: 20 })
  const params = { headers: { 'Content-Type': 'application/json' } }
  const res = http.post(url, payload, params)
  check(res, {
    'status is 200': (r) => r.status === 200,
  })
  sleep(0.05)
}
