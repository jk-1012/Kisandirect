ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS price_override_justification TEXT;

COMMENT ON COLUMN public.listings.price_override_justification IS
  'Farmer explanation required when asking price exceeds 300% of current mandi price.';
