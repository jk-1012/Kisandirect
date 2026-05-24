-- Create offers table to track Make Offer state machine
CREATE TABLE public.offers (
  id SERIAL PRIMARY KEY,
  offer_id VARCHAR(32) NOT NULL UNIQUE,
  listing_id INTEGER NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  farmer_id UUID NOT NULL REFERENCES public.users(id),
  quantity_kg NUMERIC NOT NULL,
  offered_price_paise BIGINT NOT NULL,
  counter_price_paise BIGINT,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, COUNTER_OFFERED, DECLINED, EXPIRED
  order_id VARCHAR(64), -- linked order.order_id when accepted
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offers_listing_id ON public.offers(listing_id);
CREATE INDEX idx_offers_buyer_id ON public.offers(buyer_id);
CREATE INDEX idx_offers_farmer_id ON public.offers(farmer_id);

COMMENT ON TABLE public.offers IS 'Offers made by buyers on listings; lifecycle handled by listing queue';
