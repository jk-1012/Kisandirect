-- Migration 022: Enhanced KYC system with encrypted vault storage and audit logging

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing constraints if they exist (for idempotency)
ALTER TABLE IF EXISTS vault.farmer_kyc DROP CONSTRAINT IF EXISTS farmer_kyc_farmer_id_key;

-- Alter vault.farmer_kyc table to add encrypted fields for KYC documents
-- These columns store AES-256 encrypted PII
ALTER TABLE vault.farmer_kyc
  ADD COLUMN IF NOT EXISTS aadhaar_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS aadhaar_ref_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pan_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS pan_ref_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS land_ownership_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS land_ownership_ref_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add UNIQUE constraint on farmer_id
ALTER TABLE vault.farmer_kyc
  ADD CONSTRAINT farmer_kyc_farmer_id_key UNIQUE (farmer_id);

-- Create KYC audit logs table for compliance and monitoring
CREATE TABLE IF NOT EXISTS vault.kyc_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  user_id UUID,
  farmer_id UUID,
  session_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  details JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'success',
  error_message TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Create indexes for efficient querying
  CONSTRAINT valid_event_status CHECK (status IN ('success', 'failure', 'pending'))
);

-- Create indexes for KYC audit logs
CREATE INDEX IF NOT EXISTS kyc_audit_logs_event_id_idx ON vault.kyc_audit_logs(event_id);
CREATE INDEX IF NOT EXISTS kyc_audit_logs_event_type_idx ON vault.kyc_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS kyc_audit_logs_farmer_id_idx ON vault.kyc_audit_logs(farmer_id);
CREATE INDEX IF NOT EXISTS kyc_audit_logs_user_id_idx ON vault.kyc_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS kyc_audit_logs_session_id_idx ON vault.kyc_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS kyc_audit_logs_timestamp_idx ON vault.kyc_audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS kyc_audit_logs_status_idx ON vault.kyc_audit_logs(status);

-- Create indexes on vault.farmer_kyc for efficient lookups
CREATE INDEX IF NOT EXISTS farmer_kyc_farmer_id_idx ON vault.farmer_kyc(farmer_id);
CREATE INDEX IF NOT EXISTS farmer_kyc_kyc_status_idx ON vault.farmer_kyc(kyc_status);
CREATE INDEX IF NOT EXISTS farmer_kyc_kyc_verified_at_idx ON vault.farmer_kyc(kyc_verified_at);
CREATE INDEX IF NOT EXISTS farmer_kyc_kyc_expires_at_idx ON vault.farmer_kyc(kyc_expires_at);
CREATE INDEX IF NOT EXISTS farmer_kyc_digilocker_ref_idx ON vault.farmer_kyc(digilocker_ref);

-- Update trigger to maintain updated_at timestamp
CREATE OR REPLACE FUNCTION vault.update_kyc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_farmer_kyc_updated_at ON vault.farmer_kyc;
CREATE TRIGGER update_farmer_kyc_updated_at
  BEFORE UPDATE ON vault.farmer_kyc
  FOR EACH ROW
  EXECUTE FUNCTION vault.update_kyc_updated_at();

-- Grant appropriate permissions to application role
GRANT SELECT, INSERT, UPDATE ON vault.farmer_kyc TO postgres;
GRANT SELECT, INSERT ON vault.kyc_audit_logs TO postgres;

-- Add comments for clarity
COMMENT ON TABLE vault.farmer_kyc IS 'Stores encrypted KYC data (Aadhaar, PAN, Land Ownership) for farmers';
COMMENT ON TABLE vault.kyc_audit_logs IS 'Audit trail for KYC operations for DPDP compliance';
COMMENT ON COLUMN vault.farmer_kyc.aadhaar_encrypted IS 'AES-256 encrypted Aadhaar number';
COMMENT ON COLUMN vault.farmer_kyc.pan_encrypted IS 'AES-256 encrypted PAN number';
COMMENT ON COLUMN vault.farmer_kyc.land_ownership_encrypted IS 'AES-256 encrypted land ownership document data';
COMMENT ON COLUMN vault.kyc_audit_logs.details IS 'JSONB field containing event-specific details and metadata';
