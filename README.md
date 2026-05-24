# KisanDirect Phase 1 Foundation

KisanDirect is a production-grade farmer-to-buyer marketplace for Indian smallholder farmers. This repository contains the Phase 1 foundation for Database migrations, Auth service, and Farmer Onboarding.

## Architecture

- `frontend/`: Next.js 14 App Router with Tailwind, Zustand, React Query, Workbox PWA, multilingual support.
- `backend/`: Fastify-based API service with Postgres migrations, Redis/BullMQ jobs, JWT auth, and Farmer Onboarding.

## Run locally

1. Install dependencies: `npm install`
2. Run database migrations: `npm run db:migrate`
3. Start backend: `npm run dev:backend`
4. Start frontend: `npm run dev:frontend`

## Backend environment variables

Create a `.env` file in `backend/` with at least:

- `DATABASE_URL=postgres://user:pass@localhost:5432/kisandirect`
- `REDIS_URL=redis://localhost:6379`
- `JWT_SECRET=change-this`
- `RAZORPAY_KEY_ID=your_razorpay_key_id`
- `RAZORPAY_KEY_SECRET=your_razorpay_key_secret`
- `RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret`
- `COMMISSION_STANDARD_PERCENT=2`
- `COMMISSION_PREMIUM_PERCENT=3`
- `TDS_THRESHOLD_INR=100000`
- `FRONTEND_URL=http://localhost:3000`

## Frontend environment variables

Create a `.env.local` in `frontend/` with:

- `NEXT_PUBLIC_API_URL=http://localhost:4000`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id`

## Platform constraints

- Data residency: AWS ap-south-1 only
- Payment escrow flow: Razorpay integration pending
- Auth: MSG91 OTP flow stubbed for Phase 1
- KYC: DigiLocker hooks ready for OAuth2/PKCE
