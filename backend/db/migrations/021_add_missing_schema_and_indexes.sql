-- Add missing SRS-aligned tables and key production indexes

CREATE TABLE IF NOT EXISTS public.buyer_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buyer_subscriptions_buyer_id ON public.buyer_subscriptions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_subscriptions_status ON public.buyer_subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_subscriptions_unique_active ON public.buyer_subscriptions(buyer_id, plan) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.supply_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crop_type VARCHAR(100) NOT NULL,
  state_code VARCHAR(4) NOT NULL,
  district VARCHAR(100),
  forecast_date DATE NOT NULL,
  forecasted_quantity_kg DECIMAL(12,2) NOT NULL,
  submitted_by UUID REFERENCES public.users(id),
  source VARCHAR(50) NOT NULL DEFAULT 'system',
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_forecasts_unique ON public.supply_forecasts(crop_type, state_code, district, forecast_date);
CREATE INDEX IF NOT EXISTS idx_supply_forecasts_state_date ON public.supply_forecasts(state_code, forecast_date);

CREATE TABLE IF NOT EXISTS public.order_modifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  modified_by UUID REFERENCES public.users(id),
  modification_type VARCHAR(50) NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_modifications_order_id ON public.order_modifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_modifications_status ON public.order_modifications(status);

CREATE TABLE IF NOT EXISTS public.logistics_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  service_regions TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  rating DECIMAL(3,2) DEFAULT 0.00,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logistics_providers_active ON public.logistics_providers(active);
CREATE INDEX IF NOT EXISTS idx_logistics_providers_name ON public.logistics_providers(name);

CREATE TABLE IF NOT EXISTS public.cold_storage_temperature_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES public.cold_storage_facilities(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.cold_storage_bookings(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temperature_celsius DECIMAL(5,2) NOT NULL,
  humidity_percent DECIMAL(5,2),
  alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cold_storage_temperature_logs_facility ON public.cold_storage_temperature_logs(facility_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cold_storage_temperature_logs_booking ON public.cold_storage_temperature_logs(booking_id);

-- Add missing performance indexes for listing and order lookup
CREATE INDEX IF NOT EXISTS idx_listings_state_crop ON public.listings(state_code, crop_type);
CREATE INDEX IF NOT EXISTS idx_listings_status_expires ON public.listings(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON public.orders(razorpay_order_id);
