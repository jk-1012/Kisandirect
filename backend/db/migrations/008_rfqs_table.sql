-- RFQ table for bulk buyer requests
CREATE TABLE public.rfqs (
  id SERIAL PRIMARY KEY,
  rfq_id VARCHAR(32) NOT NULL UNIQUE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  crop_type VARCHAR(64) NOT NULL,
  quantity_mt NUMERIC NOT NULL,
  price_ceiling_inr_per_kg NUMERIC NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_district VARCHAR(128) NOT NULL,
  delivery_state_code VARCHAR(2) NOT NULL,
  quality_requirements TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rfqs_buyer_id ON public.rfqs(buyer_id);
CREATE INDEX idx_rfqs_crop_state ON public.rfqs(crop_type, delivery_state_code);

COMMENT ON TABLE public.rfqs IS 'Requests for Quote from institutional buyers';
