-- Enhance cold_storage_facilities with operator tracking and temperature management
ALTER TABLE public.cold_storage_facilities
  ADD COLUMN operator_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN temperature_range_min DECIMAL(4,1) DEFAULT 0,
  ADD COLUMN temperature_range_max DECIMAL(4,1) DEFAULT 10,
  ADD COLUMN suitable_crops TEXT[] DEFAULT '{}',
  ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN last_synced_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for operator lookup (cold storage operator dashboard)
CREATE INDEX idx_cold_storage_operator ON public.cold_storage_facilities(operator_user_id);

-- Create index for verified facility search
CREATE INDEX idx_cold_storage_verified ON public.cold_storage_facilities(verified) WHERE verified = TRUE;

-- Create index for location-based search with verification
CREATE INDEX idx_cold_storage_location_verified 
  ON public.cold_storage_facilities USING GIST(location) 
  WHERE verified = TRUE;

COMMENT ON COLUMN public.cold_storage_facilities.operator_user_id IS 'Reference to cold storage operator user account';
COMMENT ON COLUMN public.cold_storage_facilities.temperature_range_min IS 'Minimum temperature in Celsius for this facility';
COMMENT ON COLUMN public.cold_storage_facilities.temperature_range_max IS 'Maximum temperature in Celsius for this facility';
COMMENT ON COLUMN public.cold_storage_facilities.suitable_crops IS 'Array of crop types this facility can store (e.g., {TOMATO,ONION,POTATO})';
COMMENT ON COLUMN public.cold_storage_facilities.verified IS 'NABARD-verified cold storage facility';
