-- Add missing user flags for institutional buyers and premium tiers
ALTER TABLE public.users
  ADD COLUMN is_institutional BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for filtering institutional buyers (RFQ matching)
CREATE INDEX idx_users_institutional ON public.users(is_institutional) WHERE is_institutional = TRUE;

-- Create composite index for buyer filtering
CREATE INDEX idx_users_premium_role ON public.users(is_premium, role);

-- Add comment for clarity
COMMENT ON COLUMN public.users.is_institutional IS 'Flag indicating if user is an institutional buyer (restaurant chains, exporters, etc.)';
COMMENT ON COLUMN public.users.is_premium IS 'Flag indicating if user has paid premium subscription (0% commission, priority support)';
