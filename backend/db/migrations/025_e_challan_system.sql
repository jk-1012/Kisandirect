/**
 * E-Challan System Migration
 * Implements complete digital challan workflow with signatures, OTP, and audit logging
 * 
 * Features:
 * - Challan document management
 * - Buyer/Farmer digital signatures
 * - OTP-based verification
 * - Audit trail for compliance
 * - Tamper-proof hashing
 * - S3 archival tracking
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create e_challan_status enum
CREATE TYPE vault.e_challan_status AS ENUM (
  'DRAFT',
  'OTP_SENT',
  'OTP_VERIFIED',
  'BUYER_SIGNED',
  'FARMER_SIGNED',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED'
);

-- Create e_challan_signature_type enum
CREATE TYPE vault.e_challan_signature_type AS ENUM (
  'BUYER',
  'FARMER',
  'DELIVERY_AGENT'
);

-- Create main e_challans table
CREATE TABLE IF NOT EXISTS vault.e_challans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  
  -- Status tracking
  status vault.e_challan_status DEFAULT 'DRAFT' NOT NULL,
  
  -- Document content
  challan_number VARCHAR(50) UNIQUE NOT NULL,
  challan_html TEXT, -- Original HTML template
  challan_pdf_path TEXT, -- S3 path to final signed PDF
  
  -- OTP verification
  otp_code VARCHAR(6),
  otp_sent_at TIMESTAMP,
  otp_verified_at TIMESTAMP,
  otp_attempts INTEGER DEFAULT 0,
  otp_max_attempts INTEGER DEFAULT 3,
  
  -- QR code
  qr_code TEXT, -- Base64 encoded QR code image
  qr_verification_token VARCHAR(255) UNIQUE,
  qr_verified_at TIMESTAMP,
  
  -- Fingerprints for tamper detection
  content_hash VARCHAR(256), -- SHA-256 hash of unencrypted content
  final_hash VARCHAR(256), -- SHA-256 of signed PDF
  
  -- Metadata
  delivery_date DATE,
  estimated_delivery_date DATE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  archived_at TIMESTAMP,
  
  -- Tracking
  created_by UUID REFERENCES public.users(id),
  modified_by UUID REFERENCES public.users(id),
  
  CONSTRAINT valid_status_transition CHECK (
    -- Can only archive after completion
    (status = 'ARCHIVED' AND archived_at IS NOT NULL) OR
    status != 'ARCHIVED'
  ),
  CONSTRAINT valid_completion_timestamp CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL) OR
    status != 'COMPLETED'
  )
);

-- Create e_challan_signatures table (stores buyer & farmer signatures)
CREATE TABLE IF NOT EXISTS vault.e_challan_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challan_id UUID NOT NULL REFERENCES vault.e_challans(id) ON DELETE CASCADE,
  
  -- Signer information
  signer_id UUID NOT NULL, -- References either buyer or farmer
  signer_type vault.e_challan_signature_type NOT NULL,
  signer_name VARCHAR(255) NOT NULL,
  signer_phone VARCHAR(20),
  signer_email VARCHAR(255),
  
  -- Signature data
  signature_image_base64 TEXT NOT NULL, -- Base64 encoded signature image
  signature_type VARCHAR(50), -- 'canvas' | 'typed' | 'photo'
  signature_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Signature metadata
  device_info JSONB, -- {userAgent, platform, resolution}
  geolocation JSONB, -- {latitude, longitude, accuracy}
  ip_address INET,
  
  -- Hash verification
  signature_hash VARCHAR(256) NOT NULL, -- SHA-256 of signature image
  
  -- Verification
  verified_at TIMESTAMP,
  verification_method VARCHAR(50), -- 'OTP' | 'BIOMETRIC' | 'MANUAL'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT one_signature_per_signer UNIQUE (challan_id, signer_type)
);

-- Create challan_audit_log table (immutable)
CREATE TABLE IF NOT EXISTS vault.challan_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challan_id UUID NOT NULL REFERENCES vault.e_challans(id) ON DELETE CASCADE,
  
  -- Action details
  action VARCHAR(100) NOT NULL, -- e.g., 'CREATED', 'OTP_SENT', 'OTP_VERIFIED', 'SIGNED', 'COMPLETED', 'ARCHIVED'
  previous_status vault.e_challan_status,
  new_status vault.e_challan_status,
  
  -- Audit details
  actor_id UUID REFERENCES public.users(id),
  actor_type VARCHAR(50), -- 'SYSTEM' | 'USER' | 'ADMIN'
  
  -- Context
  change_details JSONB, -- Full context of action
  
  -- Device/Network info
  ip_address INET,
  user_agent TEXT,
  
  -- Integrity
  action_hash VARCHAR(256) NOT NULL, -- SHA-256 for tamper detection
  
  -- Immutable timestamp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT immutable_log CHECK (created_at = created_at)
);

-- Create otp_cache table (temporary, TTL-enabled)
CREATE TABLE IF NOT EXISTS vault.otp_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challan_id UUID NOT NULL UNIQUE REFERENCES vault.e_challans(id) ON DELETE CASCADE,
  
  -- OTP details
  otp_code VARCHAR(6) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_email VARCHAR(255),
  
  -- Expiration
  expires_at TIMESTAMP NOT NULL,
  
  -- Attempts
  verification_attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_otp_length CHECK (LENGTH(otp_code) = 6),
  CONSTRAINT valid_expiration CHECK (expires_at > CURRENT_TIMESTAMP)
);

-- Create challan_s3_archive table (tracks uploaded files)
CREATE TABLE IF NOT EXISTS vault.challan_s3_archive (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challan_id UUID NOT NULL UNIQUE REFERENCES vault.e_challans(id) ON DELETE CASCADE,
  
  -- S3 details
  bucket_name VARCHAR(255) NOT NULL,
  file_key VARCHAR(500) NOT NULL UNIQUE,
  file_size_bytes BIGINT,
  
  -- Object metadata
  content_type VARCHAR(100),
  etag VARCHAR(255),
  
  -- Encryption
  server_side_encryption VARCHAR(50), -- 'AES256' | 'aws:kms'
  encryption_key_id VARCHAR(255), -- KMS key ARN if applicable
  
  -- Access control
  is_public BOOLEAN DEFAULT FALSE,
  access_control_list VARCHAR(50), -- 'private' | 'public-read' | 'authenticated-read'
  
  -- Retrieval
  https_url TEXT NOT NULL,
  expires_at TIMESTAMP, -- Presigned URL expiration
  
  -- Verification
  file_hash VARCHAR(256) NOT NULL, -- SHA-256 for integrity check
  
  -- Timestamps
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_e_challans_order_id ON vault.e_challans(order_id);
CREATE INDEX IF NOT EXISTS idx_e_challans_farmer_id ON vault.e_challans(farmer_id);
CREATE INDEX IF NOT EXISTS idx_e_challans_buyer_id ON vault.e_challans(buyer_id);
CREATE INDEX IF NOT EXISTS idx_e_challans_status ON vault.e_challans(status);
CREATE INDEX IF NOT EXISTS idx_e_challans_created_at ON vault.e_challans(created_at);
CREATE INDEX IF NOT EXISTS idx_e_challans_challan_number ON vault.e_challans(challan_number);

CREATE INDEX IF NOT EXISTS idx_challan_signatures_challan_id ON vault.e_challan_signatures(challan_id);
CREATE INDEX IF NOT EXISTS idx_challan_signatures_signer_id ON vault.e_challan_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_challan_signatures_signer_type ON vault.e_challan_signatures(signer_type);
CREATE INDEX IF NOT EXISTS idx_challan_signatures_created_at ON vault.e_challan_signatures(created_at);

CREATE INDEX IF NOT EXISTS idx_challan_audit_log_challan_id ON vault.challan_audit_log(challan_id);
CREATE INDEX IF NOT EXISTS idx_challan_audit_log_action ON vault.challan_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_challan_audit_log_created_at ON vault.challan_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_challan_audit_log_actor_id ON vault.challan_audit_log(actor_id);

CREATE INDEX IF NOT EXISTS idx_otp_cache_challan_id ON vault.otp_cache(challan_id);
CREATE INDEX IF NOT EXISTS idx_otp_cache_expires_at ON vault.otp_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_challan_s3_archive_challan_id ON vault.challan_s3_archive(challan_id);
CREATE INDEX IF NOT EXISTS idx_challan_s3_archive_uploaded_at ON vault.challan_s3_archive(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_challan_s3_archive_file_key ON vault.challan_s3_archive(file_key);

-- Create views
CREATE OR REPLACE VIEW vault.challan_summary AS
SELECT
  c.id,
  c.order_id,
  c.challan_number,
  c.status,
  c.farmer_id,
  c.buyer_id,
  (SELECT COUNT(*) FROM vault.e_challan_signatures WHERE challan_id = c.id) AS signature_count,
  (SELECT COUNT(*) FROM vault.challan_audit_log WHERE challan_id = c.id) AS audit_log_count,
  c.created_at,
  c.completed_at,
  c.archived_at,
  CASE 
    WHEN c.status = 'COMPLETED' THEN EXTRACT(EPOCH FROM (c.completed_at - c.created_at)) / 3600
    WHEN c.status = 'ARCHIVED' THEN EXTRACT(EPOCH FROM (c.archived_at - c.created_at)) / 3600
    ELSE EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at)) / 3600
  END AS processing_hours
FROM vault.e_challans c;

CREATE OR REPLACE VIEW vault.challan_audit_trail AS
SELECT
  cal.id,
  cal.challan_id,
  cal.action,
  cal.previous_status,
  cal.new_status,
  cal.actor_id,
  cal.actor_type,
  cal.change_details,
  cal.ip_address,
  cal.created_at,
  ROW_NUMBER() OVER (PARTITION BY cal.challan_id ORDER BY cal.created_at DESC) AS action_sequence
FROM vault.challan_audit_log cal
ORDER BY cal.created_at DESC;

-- Helper functions

/**
 * Generate unique challan number
 * Format: CH-YYYY-XXXXXX (e.g., CH-2026-000001)
 */
CREATE OR REPLACE FUNCTION vault.generate_challan_number()
RETURNS VARCHAR AS $$
DECLARE
  v_year VARCHAR := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_sequence INTEGER;
  v_challan_number VARCHAR;
BEGIN
  -- Get next sequence number for current year
  SELECT COALESCE(MAX(CAST(SUBSTRING(challan_number, 9) AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM vault.e_challans
  WHERE challan_number LIKE 'CH-' || v_year || '-%';
  
  v_challan_number := 'CH-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
  
  RETURN v_challan_number;
END;
$$ LANGUAGE plpgsql;

/**
 * Create audit log entry
 */
CREATE OR REPLACE FUNCTION vault.create_challan_audit_log(
  p_challan_id UUID,
  p_action VARCHAR,
  p_previous_status vault.e_challan_status,
  p_new_status vault.e_challan_status,
  p_actor_id UUID,
  p_actor_type VARCHAR,
  p_change_details JSONB,
  p_ip_address INET,
  p_user_agent TEXT
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_action_hash VARCHAR;
BEGIN
  -- Create hash from action details for tamper detection
  v_action_hash := encode(
    digest(
      p_challan_id::TEXT || p_action || COALESCE(p_previous_status::TEXT, '') || 
      COALESCE(p_new_status::TEXT, '') || p_actor_type || CURRENT_TIMESTAMP::TEXT,
      'sha256'
    ),
    'hex'
  );
  
  INSERT INTO vault.challan_audit_log (
    challan_id,
    action,
    previous_status,
    new_status,
    actor_id,
    actor_type,
    change_details,
    ip_address,
    user_agent,
    action_hash
  ) VALUES (
    p_challan_id,
    p_action,
    p_previous_status,
    p_new_status,
    p_actor_id,
    p_actor_type,
    p_change_details,
    p_ip_address,
    p_user_agent,
    v_action_hash
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Calculate content hash for challan
 */
CREATE OR REPLACE FUNCTION vault.calculate_challan_content_hash(
  p_challan_html TEXT
)
RETURNS VARCHAR AS $$
BEGIN
  RETURN encode(digest(p_challan_html, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

/**
 * Verify challan hasn't been tampered with
 */
CREATE OR REPLACE FUNCTION vault.verify_challan_integrity(
  p_challan_id UUID
)
RETURNS TABLE(
  is_valid BOOLEAN,
  challan_status vault.e_challan_status,
  verification_timestamp TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (c.content_hash = vault.calculate_challan_content_hash(c.challan_html)) AS is_valid,
    c.status,
    CURRENT_TIMESTAMP
  FROM vault.e_challans c
  WHERE c.id = p_challan_id;
END;
$$ LANGUAGE plpgsql;

-- Triggers

/**
 * Update challan timestamp on modification
 */
CREATE OR REPLACE FUNCTION vault.update_challan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER challan_timestamp_update
BEFORE UPDATE ON vault.e_challans
FOR EACH ROW
EXECUTE FUNCTION vault.update_challan_timestamp();

/**
 * Clean up expired OTPs
 */
CREATE OR REPLACE FUNCTION vault.cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM vault.otp_cache
  WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON vault.e_challans TO kisandirect_api;
GRANT SELECT, INSERT ON vault.e_challan_signatures TO kisandirect_api;
GRANT SELECT, INSERT ON vault.challan_audit_log TO kisandirect_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON vault.otp_cache TO kisandirect_api;
GRANT SELECT, INSERT ON vault.challan_s3_archive TO kisandirect_api;
GRANT SELECT ON vault.challan_summary TO kisandirect_api;
GRANT SELECT ON vault.challan_audit_trail TO kisandirect_api;
GRANT EXECUTE ON FUNCTION vault.generate_challan_number() TO kisandirect_api;
GRANT EXECUTE ON FUNCTION vault.create_challan_audit_log(UUID, VARCHAR, vault.e_challan_status, vault.e_challan_status, UUID, VARCHAR, JSONB, INET, TEXT) TO kisandirect_api;
GRANT EXECUTE ON FUNCTION vault.calculate_challan_content_hash(TEXT) TO kisandirect_api;
GRANT EXECUTE ON FUNCTION vault.verify_challan_integrity(UUID) TO kisandirect_api;
GRANT EXECUTE ON FUNCTION vault.cleanup_expired_otps() TO kisandirect_api;
