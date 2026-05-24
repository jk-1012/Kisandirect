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

CREATE TABLE public.price_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  crop_type VARCHAR(100) NOT NULL,
  state_code VARCHAR(4) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('ABOVE', 'BELOW')),
  threshold_price_paise INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.price_alerts (user_id, crop_type, state_code, direction);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
  delivered_via VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.notifications (user_id, is_read, status, created_at DESC);
