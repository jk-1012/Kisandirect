CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(10) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'FARMER',
  language VARCHAR(20) NOT NULL DEFAULT 'en',
  kisan_id VARCHAR(20) UNIQUE,
  kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  trust_score INTEGER NOT NULL DEFAULT 0,
  profile_photo_url TEXT,
  geo_lat DECIMAL(10,8),
  geo_lng DECIMAL(11,8),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.fpos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nabard_registration_number VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  state_code VARCHAR(4) NOT NULL,
  admin_user_id UUID REFERENCES public.users(id),
  member_count INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.farmer_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id),
  state_code VARCHAR(4) NOT NULL,
  district VARCHAR(100),
  village VARCHAR(100),
  farm_size_acres DECIMAL(8,2),
  crop_specializations TEXT[],
  fpo_id UUID REFERENCES public.fpos(id),
  annual_payout_inr INTEGER NOT NULL DEFAULT 0,
  tds_deducted_inr INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id VARCHAR(25) UNIQUE NOT NULL,
  farmer_id UUID NOT NULL REFERENCES public.users(id),
  crop_type VARCHAR(100) NOT NULL,
  crop_category VARCHAR(50) NOT NULL,
  quantity_kg DECIMAL(10,2) NOT NULL,
  quantity_remaining_kg DECIMAL(10,2) NOT NULL,
  asking_price_paise INTEGER NOT NULL,
  mandi_price_paise INTEGER,
  harvest_date DATE NOT NULL,
  delivery_available BOOLEAN NOT NULL DEFAULT FALSE,
  organic BOOLEAN NOT NULL DEFAULT FALSE,
  grade VARCHAR(1),
  description TEXT,
  photo_urls TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  geo_lat DECIMAL(10,8),
  geo_lng DECIMAL(11,8),
  ai_detected_crop VARCHAR(100),
  ai_confidence DECIMAL(5,2),
  job_ids JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(25) UNIQUE NOT NULL,
  listing_id UUID NOT NULL REFERENCES public.listings(id),
  farmer_id UUID NOT NULL REFERENCES public.users(id),
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  quantity_kg DECIMAL(10,2) NOT NULL,
  agreed_price_paise INTEGER NOT NULL,
  subtotal_paise INTEGER NOT NULL,
  platform_fee_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  order_status VARCHAR(30) NOT NULL DEFAULT 'PLACED',
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  escrow_release_at TIMESTAMPTZ,
  delivery_confirmed_at TIMESTAMPTZ,
  challan_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.otp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(10) NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  consent_type VARCHAR(50) NOT NULL,
  consented BOOLEAN NOT NULL,
  policy_version VARCHAR(10) NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET
);
