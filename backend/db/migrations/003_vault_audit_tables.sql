CREATE TABLE vault.farmer_kyc (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID NOT NULL UNIQUE,
  aadhaar_encrypted BYTEA NOT NULL,
  pan_encrypted BYTEA,
  bank_account_token VARCHAR(200),
  bank_ifsc VARCHAR(20),
  bank_verified BOOLEAN NOT NULL DEFAULT FALSE,
  penny_drop_ref VARCHAR(100),
  digilocker_ref VARCHAR(200),
  kyc_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vault.farmer_kyc ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_service_access ON vault.farmer_kyc
  FOR ALL
  TO payment_service
  USING (true)
  WITH CHECK (true);

CREATE TABLE audit.transaction_ledger (
  id BIGSERIAL PRIMARY KEY,
  txn_id VARCHAR(50) NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  event_type VARCHAR(50) NOT NULL,
  amount_paise BIGINT NOT NULL,
  farmer_id UUID,
  buyer_id UUID,
  metadata JSONB,
  prev_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
