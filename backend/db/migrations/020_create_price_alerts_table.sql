-- Create price alerts table for farmer subscriptions to commodity price changes
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  crop_type VARCHAR(100) NOT NULL,
  state_code VARCHAR(2) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('ABOVE', 'BELOW')),
  threshold_price_per_kg_inr DECIMAL(8,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'price_alerts' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'price_alerts' AND column_name = 'farmer_id'
  ) THEN
    ALTER TABLE public.price_alerts RENAME COLUMN user_id TO farmer_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'price_alerts' AND column_name = 'threshold_price_paise'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'price_alerts' AND column_name = 'threshold_price_per_kg_inr'
  ) THEN
    ALTER TABLE public.price_alerts RENAME COLUMN threshold_price_paise TO threshold_price_per_kg_inr;
    ALTER TABLE public.price_alerts ALTER COLUMN threshold_price_per_kg_inr TYPE DECIMAL(8,2) USING threshold_price_per_kg_inr::DECIMAL(8,2) / 100;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'price_alerts' AND column_name = 'threshold_price_per_kg_inr'
  ) THEN
    ALTER TABLE public.price_alerts ADD COLUMN threshold_price_per_kg_inr DECIMAL(8,2) NOT NULL DEFAULT 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'price_alerts' AND column_name = 'direction'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.price_alerts'::regclass AND conname = 'price_alerts_direction_check'
  ) THEN
    ALTER TABLE public.price_alerts ADD CONSTRAINT price_alerts_direction_check CHECK (direction IN ('ABOVE', 'BELOW'));
  END IF;
END $$;

-- Create composite index for alert lookup during price fetch job
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON public.price_alerts(crop_type, state_code, active) 
  WHERE active = TRUE;

-- Create index for farmer's alerts
CREATE INDEX IF NOT EXISTS idx_price_alerts_farmer ON public.price_alerts(farmer_id, active);

-- Create constraint to prevent duplicate active alerts per farmer per crop per state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'idx_price_alerts_unique_active'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.price_alerts
      WHERE active = TRUE
      GROUP BY farmer_id, crop_type, state_code, direction
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX idx_price_alerts_unique_active 
        ON public.price_alerts(farmer_id, crop_type, state_code, direction) 
        WHERE active = TRUE;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.price_alerts IS 'Farmer price alert subscriptions for WhatsApp notifications when mandi price crosses threshold';
COMMENT ON COLUMN public.price_alerts.direction IS 'ABOVE: alert when price exceeds threshold; BELOW: alert when price falls below threshold';
COMMENT ON COLUMN public.price_alerts.last_triggered_at IS 'Timestamp of last alert to prevent spam (cooldown enforced by job)';
