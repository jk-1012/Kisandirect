CREATE TABLE public.cold_storage_facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nabard_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  operator_user_id UUID REFERENCES public.users(id),
  address TEXT,
  state_code VARCHAR(4) NOT NULL,
  district VARCHAR(100) NOT NULL,
  geo_lat DECIMAL(10,8) NOT NULL,
  geo_lng DECIMAL(11,8) NOT NULL,
  total_capacity_mt DECIMAL(10,2) NOT NULL,
  available_capacity_mt DECIMAL(10,2) NOT NULL,
  price_per_mt_per_week_paise INTEGER NOT NULL,
  temperature_range_min DECIMAL(5,2),
  temperature_range_max DECIMAL(5,2),
  suitable_crops TEXT[],
  operator_phone VARCHAR(10),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cold_storage_geo ON public.cold_storage_facilities USING GIST(ST_MakePoint(geo_lng, geo_lat));
CREATE INDEX idx_cold_storage_district ON public.cold_storage_facilities(district, state_code);

CREATE TABLE public.cold_storage_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_ref VARCHAR(25) UNIQUE NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.cold_storage_facilities(id),
  farmer_id UUID NOT NULL REFERENCES public.users(id),
  entry_date DATE NOT NULL,
  exit_date DATE NOT NULL,
  quantity_mt DECIMAL(10,2) NOT NULL,
  crop_type VARCHAR(100) NOT NULL,
  temperature_agreed_min DECIMAL(5,2),
  temperature_agreed_max DECIMAL(5,2),
  price_per_mt_per_week_paise INTEGER NOT NULL,
  total_weeks DECIMAL(4,2) NOT NULL,
  total_amount_paise INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
  razorpay_payment_id VARCHAR(100),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
