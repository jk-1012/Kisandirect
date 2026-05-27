import http from 'k6/http';
import { check, sleep } from 'k6';

// Test OTP flow under load
export const otpOptions = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // OTP can be slower (SMS)
    http_req_failed: ['rate<0.02'],
  },
};

export default function otpFlow() {
  const phone = `9${Math.floor(700000000 + Math.random() * 299999999)}`;

  const otpRes = http.post(`${__ENV.API_BASE_URL}/api/v1/auth/otp/request`,
    JSON.stringify({ phone }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(otpRes, {
    'OTP request 200': (r) => r.status === 200,
    'OTP response < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(1);
}
