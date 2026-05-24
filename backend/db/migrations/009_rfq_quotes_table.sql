-- Quotes submitted by farmers in response to RFQs
CREATE TABLE public.rfq_quotes (
  id SERIAL PRIMARY KEY,
  quote_id VARCHAR(32) NOT NULL UNIQUE,
  rfq_id INTEGER NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quantity_kg NUMERIC NOT NULL,
  price_per_kg_inr NUMERIC NOT NULL,
  available_from_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rfq_quotes_rfq_id ON public.rfq_quotes(rfq_id);
CREATE INDEX idx_rfq_quotes_farmer_id ON public.rfq_quotes(farmer_id);

COMMENT ON TABLE public.rfq_quotes IS 'Quotes submitted by farmers for RFQs';
