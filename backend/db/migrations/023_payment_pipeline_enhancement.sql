-- Production-grade payment pipeline with escrow lifecycle, ledger, and audit trails
-- Ensures financial precision, idempotency, and DPDP compliance

-- Enable pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================
-- ESCROW LIFECYCLE MANAGEMENT
-- ===========================

CREATE TABLE IF NOT EXISTS vault.escrow_accounts (
  id BIGSERIAL PRIMARY KEY,
  escrow_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  buyer_id UUID NOT NULL,
  escrow_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, HELD, RELEASED, REFUNDED, CANCELLED, DISPUTED
  
  -- Financial amounts in paise (integer for precision)
  total_amount_paise NUMERIC(15,0) NOT NULL,
  subtotal_paise NUMERIC(15,0) NOT NULL,
  commission_paise NUMERIC(15,0) NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 2.00, -- 2% standard, 3% premium
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Holds amount at Razorpay side
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_hold_id VARCHAR(100),
  
  -- Release details
  release_requested_at TIMESTAMPTZ,
  release_approved_at TIMESTAMPTZ,
  release_completed_at TIMESTAMPTZ,
  release_failed_reason TEXT,
  
  -- Refund details
  refund_requested_at TIMESTAMPTZ,
  refund_reason VARCHAR(500),
  refund_approved_at TIMESTAMPTZ,
  refund_completed_at TIMESTAMPTZ,
  refund_failed_reason TEXT,
  refund_amount_paise NUMERIC(15,0),
  
  -- Compensation for failed delivery/dispute
  compensation_amount_paise NUMERIC(15,0) DEFAULT 0,
  compensation_reason VARCHAR(500),
  compensation_approved_at TIMESTAMPTZ,
  
  -- Versioning for optimistic locking
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT fk_escrow_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_escrow_farmer FOREIGN KEY (farmer_id) REFERENCES public.users(id),
  CONSTRAINT fk_escrow_buyer FOREIGN KEY (buyer_id) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_order_id ON vault.escrow_accounts(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_farmer_id ON vault.escrow_accounts(farmer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_buyer_id ON vault.escrow_accounts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_status ON vault.escrow_accounts(escrow_status);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_created_at ON vault.escrow_accounts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_escrow_id ON vault.escrow_accounts(escrow_id);

-- ===========================
-- PAYMENT LEDGER (IMMUTABLE)
-- ===========================

CREATE TABLE IF NOT EXISTS vault.payment_ledger (
  id BIGSERIAL PRIMARY KEY,
  transaction_id VARCHAR(100) UNIQUE NOT NULL,
  ledger_hash VARCHAR(64) NOT NULL,
  prev_ledger_hash VARCHAR(64),
  
  order_id UUID NOT NULL,
  escrow_id VARCHAR(100),
  farmer_id UUID NOT NULL,
  buyer_id UUID NOT NULL,
  
  -- Transaction type
  txn_type VARCHAR(50) NOT NULL, -- PAYMENT_CAPTURED, ESCROW_HELD, ESCROW_RELEASED, REFUND_INITIATED, REFUND_COMPLETED, COMPENSATION
  
  -- Amount fields (always in paise)
  amount_paise NUMERIC(15,0) NOT NULL,
  commission_paise NUMERIC(15,0) DEFAULT 0,
  tds_deducted_paise NUMERIC(15,0) DEFAULT 0,
  net_payout_paise NUMERIC(15,0),
  
  -- Razorpay references
  razorpay_payment_id VARCHAR(100),
  razorpay_payout_id VARCHAR(100),
  razorpay_refund_id VARCHAR(100),
  
  -- Balance computation (for verification)
  running_balance_paise NUMERIC(15,0),
  
  -- Any metadata (JSONB for flexibility)
  metadata JSONB,
  
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hash_verified_at TIMESTAMPTZ,
  
  CONSTRAINT fk_ledger_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_farmer FOREIGN KEY (farmer_id) REFERENCES public.users(id),
  CONSTRAINT fk_ledger_buyer FOREIGN KEY (buyer_id) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_order_id ON vault.payment_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_farmer_id ON vault.payment_ledger(farmer_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_buyer_id ON vault.payment_ledger(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_txn_type ON vault.payment_ledger(txn_type);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_created_at ON vault.payment_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_transaction_id ON vault.payment_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_escrow_id ON vault.payment_ledger(escrow_id);

-- ===========================
-- WEBHOOK DEDUPLICATION & IDEMPOTENCY
-- ===========================

CREATE TABLE IF NOT EXISTS vault.webhook_events (
  id BIGSERIAL PRIMARY KEY,
  webhook_event_id VARCHAR(100) UNIQUE NOT NULL, -- Razorpay event_id
  webhook_signature VARCHAR(64) NOT NULL,
  
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  
  -- Processing status
  processing_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED, DEAD_LETTER
  
  -- Attempt tracking
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Which transaction was created from this webhook
  transaction_id VARCHAR(100),
  
  -- Compensation details if needed
  required_compensation BOOLEAN DEFAULT FALSE,
  compensation_amount_paise NUMERIC(15,0),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT fk_webhook_transaction FOREIGN KEY (transaction_id) REFERENCES vault.payment_ledger(transaction_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id ON vault.webhook_events(webhook_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON vault.webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON vault.webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON vault.webhook_events(event_type);

-- ===========================
-- SETTLEMENT RECORDS
-- ===========================

CREATE TABLE IF NOT EXISTS vault.settlements (
  id BIGSERIAL PRIMARY KEY,
  settlement_id VARCHAR(100) UNIQUE NOT NULL,
  farmer_id UUID NOT NULL,
  
  -- Batch settlement
  settlement_period_start DATE NOT NULL,
  settlement_period_end DATE NOT NULL,
  
  -- Financial amounts in paise
  total_sales_paise NUMERIC(15,0) NOT NULL DEFAULT 0,
  total_commission_paise NUMERIC(15,0) NOT NULL DEFAULT 0,
  total_tds_paise NUMERIC(15,0) NOT NULL DEFAULT 0,
  total_refunds_paise NUMERIC(15,0) NOT NULL DEFAULT 0,
  net_payout_paise NUMERIC(15,0) NOT NULL,
  
  -- Settlement status
  settlement_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, PAID, FAILED
  
  -- Payout details
  razorpay_payout_id VARCHAR(100),
  razorpay_payout_status VARCHAR(50),
  bank_transfer_at TIMESTAMPTZ,
  
  -- Validation
  ledger_entries_count INTEGER,
  ledger_hash_verified BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_settlement_farmer FOREIGN KEY (farmer_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_settlements_farmer_id ON vault.settlements(farmer_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON vault.settlements(settlement_status);
CREATE INDEX IF NOT EXISTS idx_settlements_created_at ON vault.settlements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_settlement_id ON vault.settlements(settlement_id);

-- ===========================
-- FAILED PAYOUT RETRY QUEUE
-- ===========================

CREATE TABLE IF NOT EXISTS vault.failed_payouts (
  id BIGSERIAL PRIMARY KEY,
  payout_id VARCHAR(100) UNIQUE NOT NULL,
  farmer_id UUID NOT NULL,
  order_id UUID,
  
  amount_paise NUMERIC(15,0) NOT NULL,
  payout_reason VARCHAR(200),
  
  -- Retry tracking
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  backoff_multiplier DECIMAL(3,1) NOT NULL DEFAULT 2.0,
  
  next_retry_at TIMESTAMPTZ NOT NULL,
  last_attempted_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Razorpay payout ID if retried
  new_razorpay_payout_id VARCHAR(100),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, SUCCEEDED, FAILED, MANUAL_REVIEW
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_failed_payout_farmer FOREIGN KEY (farmer_id) REFERENCES public.users(id),
  CONSTRAINT fk_failed_payout_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_failed_payouts_farmer_id ON vault.failed_payouts(farmer_id);
CREATE INDEX IF NOT EXISTS idx_failed_payouts_status ON vault.failed_payouts(status);
CREATE INDEX IF NOT EXISTS idx_failed_payouts_next_retry_at ON vault.failed_payouts(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_failed_payouts_created_at ON vault.failed_payouts(created_at DESC);

-- ===========================
-- COMMISSION CONFIGURATION & TRACKING
-- ===========================

CREATE TABLE IF NOT EXISTS vault.commission_config (
  id BIGSERIAL PRIMARY KEY,
  commission_name VARCHAR(50) NOT NULL UNIQUE, -- 'STANDARD', 'PREMIUM', 'SEASONAL', etc.
  commission_percentage DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Eligibility criteria
  min_monthly_sales_paise NUMERIC(15,0),
  min_trust_score INTEGER,
  requires_cold_storage BOOLEAN DEFAULT FALSE,
  organic_products_only BOOLEAN DEFAULT FALSE,
  
  -- Effective dates
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  
  -- Metadata
  description TEXT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_config_active ON vault.commission_config(is_active);
CREATE INDEX IF NOT EXISTS idx_commission_config_name ON vault.commission_config(commission_name);

-- Insert default commission tiers
INSERT INTO vault.commission_config (commission_name, commission_percentage, min_trust_score, description) VALUES
  ('STANDARD', 2.00, 0, 'Standard commission for all farmers'),
  ('PREMIUM', 3.00, 50, 'Premium tier for high-trust farmers'),
  ('SEASONAL', 1.50, 0, 'Seasonal discount during peak harvest'),
  ('ORGANIC', 1.50, 0, 'Discount for organic certified products')
ON CONFLICT (commission_name) DO NOTHING;

-- ===========================
-- REFUND TRACKING
-- ===========================

CREATE TABLE IF NOT EXISTS vault.refunds (
  id BIGSERIAL PRIMARY KEY,
  refund_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID NOT NULL,
  buyer_id UUID NOT NULL,
  
  -- Refund details
  refund_amount_paise NUMERIC(15,0) NOT NULL,
  refund_reason VARCHAR(500) NOT NULL,
  refund_type VARCHAR(50) NOT NULL, -- FULL, PARTIAL, COMPENSATION
  
  -- Status tracking
  refund_status VARCHAR(50) NOT NULL DEFAULT 'INITIATED', -- INITIATED, APPROVED, PROCESSING, COMPLETED, FAILED
  
  -- Razorpay integration
  razorpay_refund_id VARCHAR(100),
  razorpay_refund_status VARCHAR(50),
  
  -- Timing
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  failure_reason TEXT,
  failure_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_refund_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_buyer FOREIGN KEY (buyer_id) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON vault.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_buyer_id ON vault.refunds(buyer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON vault.refunds(refund_status);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON vault.refunds(created_at DESC);

-- ===========================
-- RECONCILIATION & AUDIT
-- ===========================

CREATE TABLE IF NOT EXISTS vault.payment_reconciliation (
  id BIGSERIAL PRIMARY KEY,
  reconciliation_id VARCHAR(100) UNIQUE NOT NULL,
  
  -- Date range
  reconciliation_date DATE NOT NULL,
  
  -- Razorpay vs DB comparison
  razorpay_transactions_count INTEGER,
  db_transactions_count INTEGER,
  
  -- Amounts (in paise)
  razorpay_total_amount_paise NUMERIC(15,0),
  db_total_amount_paise NUMERIC(15,0),
  variance_paise NUMERIC(15,0),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, VARIANCE_FOUND
  
  -- Details
  notes TEXT,
  discrepancies JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_date ON vault.payment_reconciliation(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON vault.payment_reconciliation(status);

-- ===========================
-- TRIGGERS & HELPER FUNCTIONS
-- ===========================

-- Update timestamp on escrow account changes
CREATE OR REPLACE FUNCTION update_escrow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_escrow_updated_at ON vault.escrow_accounts;
CREATE TRIGGER trigger_escrow_updated_at
  BEFORE UPDATE ON vault.escrow_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_escrow_updated_at();

-- Update timestamp on settlement changes
CREATE OR REPLACE FUNCTION update_settlement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_settlement_updated_at ON vault.settlements;
CREATE TRIGGER trigger_settlement_updated_at
  BEFORE UPDATE ON vault.settlements
  FOR EACH ROW
  EXECUTE FUNCTION update_settlement_updated_at();

-- Update timestamp on refund changes
CREATE OR REPLACE FUNCTION update_refund_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_refund_updated_at ON vault.refunds;
CREATE TRIGGER trigger_refund_updated_at
  BEFORE UPDATE ON vault.refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_refund_updated_at();

-- ===========================
-- LEDGER HASH CHAIN VERIFICATION VIEWS
-- ===========================

CREATE OR REPLACE VIEW vault.ledger_chain_audit AS
SELECT 
  pl.id,
  pl.transaction_id,
  pl.ledger_hash,
  LAG(pl.ledger_hash) OVER (ORDER BY pl.created_at) as expected_prev_hash,
  pl.prev_ledger_hash as actual_prev_hash,
  CASE 
    WHEN pl.prev_ledger_hash = LAG(pl.ledger_hash) OVER (ORDER BY pl.created_at) THEN 'VALID'
    ELSE 'CHAIN_BROKEN'
  END as chain_status,
  pl.created_at
FROM vault.payment_ledger pl
ORDER BY pl.created_at DESC;

-- ===========================
-- FINANCIAL SUMMARY VIEWS
-- ===========================

CREATE OR REPLACE VIEW vault.farmer_financial_summary AS
SELECT 
  fp.user_id as farmer_id,
  u.kisan_id,
  u.first_name,
  COUNT(DISTINCT o.id) as total_orders,
  SUM(CASE WHEN o.payment_status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed_orders,
  SUM(CASE WHEN pl.txn_type = 'ESCROW_RELEASED' THEN pl.amount_paise ELSE 0 END) as total_received_paise,
  SUM(CASE WHEN pl.txn_type = 'ESCROW_RELEASED' THEN pl.commission_paise ELSE 0 END) as total_commission_paise,
  SUM(CASE WHEN pl.txn_type = 'ESCROW_RELEASED' THEN pl.tds_deducted_paise ELSE 0 END) as total_tds_paise,
  SUM(CASE WHEN pl.txn_type = 'REFUND_COMPLETED' THEN pl.amount_paise ELSE 0 END) as total_refunded_paise
FROM public.farmer_profiles fp
LEFT JOIN public.users u ON fp.user_id = u.id
LEFT JOIN public.orders o ON fp.user_id = o.farmer_id
LEFT JOIN vault.payment_ledger pl ON o.id = pl.order_id
GROUP BY fp.user_id, u.kisan_id, u.first_name;

GRANT SELECT ON vault.farmer_financial_summary TO PUBLIC;

-- ===========================
-- FINANCIAL PRECISION HELPERS
-- ===========================

-- Function to safely add paise amounts (preventing overflow)
CREATE OR REPLACE FUNCTION safe_add_paise(a NUMERIC, b NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  IF a IS NULL THEN RETURN b; END IF;
  IF b IS NULL THEN RETURN a; END IF;
  RETURN a + b;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate commission safely
CREATE OR REPLACE FUNCTION calculate_commission(amount_paise NUMERIC, commission_percentage DECIMAL)
RETURNS NUMERIC AS $$
BEGIN
  -- Round to nearest paise (avoiding floating-point errors)
  RETURN FLOOR((amount_paise * commission_percentage) / 100);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to verify ledger hash chain
CREATE OR REPLACE FUNCTION verify_ledger_chain()
RETURNS TABLE(verified BOOLEAN, broken_at_id BIGINT, issue_description TEXT) AS $$
DECLARE
  v_current_record RECORD;
  v_prev_record RECORD;
  v_verified BOOLEAN := TRUE;
  v_broken_id BIGINT := NULL;
  v_issue TEXT := NULL;
BEGIN
  FOR v_current_record IN 
    SELECT * FROM vault.payment_ledger ORDER BY created_at ASC
  LOOP
    IF v_prev_record IS NOT NULL THEN
      IF v_current_record.prev_ledger_hash IS DISTINCT FROM v_prev_record.ledger_hash THEN
        v_verified := FALSE;
        v_broken_id := v_current_record.id;
        v_issue := 'Hash chain broken at transaction ' || v_current_record.transaction_id;
        EXIT;
      END IF;
    END IF;
    v_prev_record := v_current_record;
  END LOOP;
  
  RETURN QUERY SELECT v_verified, v_broken_id, v_issue;
END;
$$ LANGUAGE plpgsql;
