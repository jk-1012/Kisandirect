CREATE TABLE public.e_challans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  verification_token VARCHAR(128) UNIQUE NOT NULL,
  challan_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'GENERATED',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  farmer_signed_at TIMESTAMPTZ,
  buyer_verified_at TIMESTAMPTZ,
  buyer_otp_hash TEXT,
  buyer_otp_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_e_challans_order_id ON public.e_challans(order_id);
CREATE INDEX idx_e_challans_verification_token ON public.e_challans(verification_token);
