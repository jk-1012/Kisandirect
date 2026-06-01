-- E-Challan Workflow Schema
-- Digital delivery notes with signatures, OTP verification, and audit logging

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Main e-challan records table
CREATE TABLE IF NOT EXISTS vault.e_challans (
  id BIGSERIAL PRIMARY KEY,
  e_challan_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES vault.farmers(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES vault.buyers(id) ON DELETE RESTRICT,
  
  -- Challan details
  challan_number VARCHAR(255) UNIQUE NOT NULL,
  challan_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  product_name VARCHAR(500) NOT NULL,
  quantity_numeric NUMERIC(15, 4) NOT NULL,
  quantity_unit VARCHAR(50) NOT NULL,
  price_per_unit NUMERIC(15, 2) NOT NULL,
  total_amount NUMERIC(15, 2) NOT NULL,
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT',           -- Initial state
    'OTP_REQUESTED',   -- OTP sent to farmer
    'OTP_VERIFIED',    -- Farmer verified
    'FARMER_SIGNED',   -- Farmer signed
    'BUYER_SIGNED',    -- Buyer signed
    'FULLY_SIGNED',    -- Both signed
    'ARCHIVED',        -- Stored in vault
    'CANCELLED',       -- Challan cancelled
    'REJECTED'         -- Rejected by either party
  )),
  
  -- PDF and document paths
  unsigned_pdf_path VARCHAR(512),
  unsigned_pdf_s3_key VARCHAR(512),
  unsigned_pdf_hash VARCHAR(255), -- SHA-256 hash for tamper detection
  
  signed_pdf_path VARCHAR(512),
  signed_pdf_s3_key VARCHAR(512),
  signed_pdf_hash VARCHAR(255),
  
  -- Signature status
  farmer_signature_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (farmer_signature_status IN ('PENDING', 'CAPTURED', 'VERIFIED')),
  buyer_signature_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (buyer_signature_status IN ('PENDING', 'CAPTURED', 'VERIFIED')),
  
  -- QR code for verification
  qr_code_data TEXT,
  qr_code_s3_key VARCHAR(512),
  qr_verification_hash VARCHAR(255),
  
  -- Escrow integration
  escrow_triggered_at TIMESTAMP,
  escrow_released_at TIMESTAMP,
  escrow_release_txn_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signed_at TIMESTAMP,
  archived_at TIMESTAMP,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Signature records with timestamp, device info, IP
CREATE TABLE IF NOT EXISTS vault.e_challan_signatures (
  id BIGSERIAL PRIMARY KEY,
  signature_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  e_challan_id UUID NOT NULL REFERENCES vault.e_challans(e_challan_id) ON DELETE CASCADE,
  
  -- Signer information
  signer_type VARCHAR(50) NOT NULL CHECK (signer_type IN ('FARMER', 'BUYER', 'WITNESS')),
  signer_id UUID NOT NULL,
  signer_name VARCHAR(255) NOT NULL,
  signer_phone VARCHAR(20),
  signer_email VARCHAR(255),
  
  -- Signature data
  signature_image_data BYTEA NOT NULL, -- Base64 encoded signature image
  signature_s3_key VARCHAR(512),
  signature_hash VARCHAR(255), -- SHA-256 for tampering detection
  
  -- Device and authentication info
  device_type VARCHAR(100), -- 'MOBILE', 'TABLET', 'DESKTOP'
  device_user_agent TEXT,
  signing_ip_address VARCHAR(45),
  signing_latitude NUMERIC(10, 8),
  signing_longitude NUMERIC(11, 8),
  
  -- Biometric/verification data
  otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  otp_verification_time TIMESTAMP,
  verification_method VARCHAR(100), -- 'OTP', 'BIOMETRIC', 'PIN'
  
  -- Signing timestamp
  signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signature_validity_days INT DEFAULT 365,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Audit fields
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- OTP verification records
CREATE TABLE IF NOT EXISTS vault.e_challan_otp (
  id BIGSERIAL PRIMARY KEY,
  otp_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  e_challan_id UUID NOT NULL REFERENCES vault.e_challans(e_challan_id) ON DELETE CASCADE,
  
  -- Recipient
  recipient_id UUID NOT NULL,
  recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('FARMER', 'BUYER')),
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  
  -- OTP details
  otp_code VARCHAR(6) NOT NULL,
  otp_hashed VARCHAR(255) NOT NULL, -- bcrypt or scrypt hash
  otp_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  otp_expires_at TIMESTAMP NOT NULL,
  otp_attempt_count INT DEFAULT 0,
  max_otp_attempts INT DEFAULT 5,
  
  -- Verification status
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMP,
  verified_ip_address VARCHAR(45),
  
  -- Expiration
  is_expired BOOLEAN NOT NULL DEFAULT FALSE,
  expired_at TIMESTAMP,
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for all e-challan operations
CREATE TABLE IF NOT EXISTS vault.e_challan_audit_log (
  id BIGSERIAL PRIMARY KEY,
  log_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  e_challan_id UUID NOT NULL REFERENCES vault.e_challans(e_challan_id) ON DELETE CASCADE,
  
  -- Actor information
  actor_id UUID,
  actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('FARMER', 'BUYER', 'ADMIN', 'SYSTEM')),
  actor_name VARCHAR(255),
  
  -- Action details
  action VARCHAR(100) NOT NULL CHECK (action IN (
    'CHALLAN_CREATED',
    'PDF_GENERATED',
    'OTP_SENT',
    'OTP_VERIFIED',
    'SIGNATURE_CAPTURED',
    'SIGNATURE_VERIFIED',
    'BOTH_SIGNED',
    'PDF_SIGNED',
    'QR_GENERATED',
    'ARCHIVED',
    'ESCROW_TRIGGERED',
    'ESCROW_RELEASED',
    'REJECTED',
    'CANCELLED',
    'ACCESSED',
    'DOWNLOADED',
    'TAMPER_DETECTED',
    'FAILURE_LOGGED'
  )),
  
  -- Action metadata
  action_details JSONB DEFAULT '{}'::JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILURE', 'WARNING')),
  error_message TEXT,
  
  -- Request/Response context
  request_ip_address VARCHAR(45),
  request_user_agent TEXT,
  response_time_ms INT,
  
  -- Timestamp
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Causality tracking
  related_log_id UUID REFERENCES vault.e_challan_audit_log(log_id) ON DELETE SET NULL
);

-- QR code tracking
CREATE TABLE IF NOT EXISTS vault.e_challan_qr_codes (
  id BIGSERIAL PRIMARY KEY,
  qr_code_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  e_challan_id UUID NOT NULL REFERENCES vault.e_challans(e_challan_id) ON DELETE CASCADE,
  
  -- QR data
  qr_code_content TEXT NOT NULL,
  qr_code_format VARCHAR(50) DEFAULT 'URL_WITH_HASH',
  
  -- Verification
  verification_hash VARCHAR(255) NOT NULL, -- SHA-256(challan_id + signature_hashes + timestamp)
  encryption_key_id VARCHAR(100),
  
  -- Access tracking
  scan_count INT DEFAULT 0,
  last_scanned_at TIMESTAMP,
  
  -- S3 location
  qr_image_s3_key VARCHAR(512),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '12 months'),
  
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Signed PDF archival (vault storage)
CREATE TABLE IF NOT EXISTS vault.e_challan_signed_documents (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  e_challan_id UUID NOT NULL REFERENCES vault.e_challans(e_challan_id) ON DELETE CASCADE,
  
  -- Document storage
  pdf_content BYTEA NOT NULL, -- Actual PDF binary (optional if using S3)
  pdf_s3_key VARCHAR(512) NOT NULL, -- S3 path
  pdf_file_size_bytes INT,
  pdf_mime_type VARCHAR(100) DEFAULT 'application/pdf',
  
  -- Integrity verification
  content_hash_sha256 VARCHAR(255) NOT NULL,
  content_hash_sha512 VARCHAR(255),
  hmac_key_id VARCHAR(100),
  
  -- Signature verification data
  signatures_count INT DEFAULT 0,
  first_signature_at TIMESTAMP,
  last_signature_at TIMESTAMP,
  all_signatures_verified BOOLEAN DEFAULT FALSE,
  
  -- Access control
  is_encrypted BOOLEAN DEFAULT TRUE,
  encryption_algorithm VARCHAR(100) DEFAULT 'AES-256-GCM',
  
  -- Timestamps
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 years'), -- Legal retention
  
  -- Audit
  archived_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_e_challans_order_id ON vault.e_challans(order_id);
CREATE INDEX IF NOT EXISTS idx_e_challans_farmer_id ON vault.e_challans(farmer_id);
CREATE INDEX IF NOT EXISTS idx_e_challans_buyer_id ON vault.e_challans(buyer_id);
CREATE INDEX IF NOT EXISTS idx_e_challans_status ON vault.e_challans(status);
CREATE INDEX IF NOT EXISTS idx_e_challans_challan_number ON vault.e_challans(challan_number);
CREATE INDEX IF NOT EXISTS idx_e_challans_created_at ON vault.e_challans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_e_challans_signed_at ON vault.e_challans(signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_signatures_e_challan_id ON vault.e_challan_signatures(e_challan_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer_type ON vault.e_challan_signatures(signer_type);
CREATE INDEX IF NOT EXISTS idx_signatures_signer_id ON vault.e_challan_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signed_at ON vault.e_challan_signatures(signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_e_challan_id ON vault.e_challan_otp(e_challan_id);
CREATE INDEX IF NOT EXISTS idx_otp_recipient_id ON vault.e_challan_otp(recipient_id);
CREATE INDEX IF NOT EXISTS idx_otp_is_verified ON vault.e_challan_otp(is_verified);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON vault.e_challan_otp(otp_expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_e_challan_id ON vault.e_challan_audit_log(e_challan_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON vault.e_challan_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON vault.e_challan_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_logged_at ON vault.e_challan_audit_log(logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_e_challan_id ON vault.e_challan_qr_codes(e_challan_id);
CREATE INDEX IF NOT EXISTS idx_qr_verification_hash ON vault.e_challan_qr_codes(verification_hash);

CREATE INDEX IF NOT EXISTS idx_archived_docs_e_challan_id ON vault.e_challan_signed_documents(e_challan_id);
CREATE INDEX IF NOT EXISTS idx_archived_docs_archived_at ON vault.e_challan_signed_documents(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_docs_expires_at ON vault.e_challan_signed_documents(expires_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION vault.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_e_challans_timestamp
BEFORE UPDATE ON vault.e_challans
FOR EACH ROW
EXECUTE FUNCTION vault.update_timestamp();

CREATE TRIGGER update_signatures_timestamp
BEFORE UPDATE ON vault.e_challan_signatures
FOR EACH ROW
EXECUTE FUNCTION vault.update_timestamp();

CREATE TRIGGER update_otp_timestamp
BEFORE UPDATE ON vault.e_challan_otp
FOR EACH ROW
EXECUTE FUNCTION vault.update_timestamp();

CREATE TRIGGER update_archived_docs_timestamp
BEFORE UPDATE ON vault.e_challan_signed_documents
FOR EACH ROW
EXECUTE FUNCTION vault.update_timestamp();

-- View for active challans needing signatures
CREATE OR REPLACE VIEW vault.e_challen_pending_signatures AS
SELECT 
  ec.id,
  ec.e_challan_id,
  ec.order_id,
  ec.challan_number,
  ec.farmer_id,
  ec.buyer_id,
  ec.status,
  ec.farmer_signature_status,
  ec.buyer_signature_status,
  CASE 
    WHEN ec.farmer_signature_status = 'PENDING' THEN 'farmer'
    WHEN ec.buyer_signature_status = 'PENDING' THEN 'buyer'
    ELSE 'none'
  END as next_signer,
  ec.created_at,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ec.created_at))/3600 as age_hours
FROM vault.e_challans ec
WHERE ec.status IN ('OTP_VERIFIED', 'FARMER_SIGNED', 'BUYER_SIGNED')
  AND (ec.farmer_signature_status != 'VERIFIED' OR ec.buyer_signature_status != 'VERIFIED')
ORDER BY ec.created_at ASC;

-- View for audit trail
CREATE OR REPLACE VIEW vault.e_challan_audit_trail AS
SELECT 
  eal.log_id,
  eal.e_challan_id,
  ec.order_id,
  ec.challan_number,
  eal.actor_id,
  eal.actor_type,
  eal.actor_name,
  eal.action,
  eal.status,
  eal.error_message,
  eal.logged_at,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - eal.logged_at)) as seconds_ago
FROM vault.e_challan_audit_log eal
JOIN vault.e_challans ec ON eal.e_challan_id = ec.e_challan_id
ORDER BY eal.logged_at DESC;
