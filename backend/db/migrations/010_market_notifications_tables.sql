CREATE TABLE public.mandi_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crop_type VARCHAR(100) NOT NULL,
  mandi_name TEXT NOT NULL DEFAULT 'STATE_AVERAGE',
  district TEXT,
  state_code VARCHAR(4) NOT NULL,
  price_inr_per_kg DECIMAL(10,2) NOT NULL,
  price_date DATE NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'agmarknet',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.mandi_prices (crop_type, state_code, price_date DESC);
CREATE INDEX ON public.mandi_prices (crop_type, state_code, mandi_name);

SELECT create_hypertable('public.mandi_prices', 'price_date', if_not_exists => true);
