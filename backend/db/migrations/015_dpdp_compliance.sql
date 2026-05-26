ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_unique_user_type UNIQUE (user_id, consent_type);

ALTER TABLE public.listings
  ALTER COLUMN farmer_id DROP NOT NULL;
