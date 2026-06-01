-- Create persistent notifications table for 90-day history and audit trail
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  delivered_via VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'delivered_via'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN delivered_via VARCHAR(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN read_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN delivered_at TIMESTAMPTZ;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.notifications ALTER COLUMN channel SET DEFAULT 'whatsapp';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.notifications ALTER COLUMN status SET DEFAULT 'PENDING';
  END IF;
END $$;

-- Create index for user notification lookup
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- Create index for cleanup job (delete >90 days old)
CREATE INDEX IF NOT EXISTS idx_notifications_created_old ON public.notifications(created_at) 
  WHERE created_at < NOW() - INTERVAL '90 days';

-- Create index for delivery status filtering
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status, user_id) 
  WHERE status IN ('PENDING', 'FAILED');

-- Create hypertable for time-series optimization
SELECT create_hypertable('public.notifications', 'created_at', if_not_exists => TRUE);

COMMENT ON TABLE public.notifications IS 'Persistent notification history; auto-purged after 90 days per SRS';
COMMENT ON COLUMN public.notifications.channel IS 'Delivery channel: whatsapp, sms, email, or in_app';
COMMENT ON COLUMN public.notifications.status IS 'Delivery status: PENDING, SENT, FAILED, or IN_APP';
