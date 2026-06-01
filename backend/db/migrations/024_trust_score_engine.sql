-- Trust Score Engine Migration
-- Implements dynamic, explainable trust scoring with time decay, penalties, and bonuses

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS vault;

-- Table: farmer_trust_scores
-- Current trust score for each farmer with calculation metadata
CREATE TABLE IF NOT EXISTS vault.farmer_trust_scores (
  id BIGSERIAL PRIMARY KEY,
  farmer_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Current score (0-100)
  trust_score_numeric NUMERIC(5, 2) NOT NULL DEFAULT 50.0 CHECK (trust_score_numeric >= 0 AND trust_score_numeric <= 100),
  
  -- Score category for quick filtering
  trust_score_category TEXT NOT NULL DEFAULT 'AVERAGE' CHECK (trust_score_category IN ('POOR', 'BELOW_AVERAGE', 'AVERAGE', 'GOOD', 'EXCELLENT')),
  
  -- Component scores (breakdown for transparency)
  base_score_numeric NUMERIC(5, 2) NOT NULL DEFAULT 50.0,
  kyc_bonus_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  completion_bonus_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  delivery_success_bonus_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  response_speed_bonus_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  
  -- Penalties
  dispute_penalty_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  cancellation_penalty_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  fraud_penalty_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  time_decay_penalty_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  
  -- Supporting metrics (for weighted calculation)
  completed_orders_count INTEGER NOT NULL DEFAULT 0,
  total_orders_count INTEGER NOT NULL DEFAULT 0,
  average_rating_numeric NUMERIC(3, 2) DEFAULT NULL,
  total_reviews_count INTEGER NOT NULL DEFAULT 0,
  dispute_count INTEGER NOT NULL DEFAULT 0,
  dispute_resolution_rate_numeric NUMERIC(5, 2) DEFAULT NULL,
  cancellation_count INTEGER NOT NULL DEFAULT 0,
  cancellation_rate_numeric NUMERIC(5, 2) DEFAULT NULL,
  fulfillment_rate_numeric NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  average_response_time_hours INTEGER DEFAULT NULL,
  kyc_level TEXT DEFAULT NULL CHECK (kyc_level IS NULL OR kyc_level IN ('NONE', 'BASIC', 'VERIFIED', 'ADVANCED')),
  profile_completeness_numeric NUMERIC(5, 2) DEFAULT NULL,
  
  -- Calculation metadata
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  recalculation_triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  calculation_method TEXT NOT NULL DEFAULT 'WEIGHTED_ALGORITHM' CHECK (calculation_method IN ('WEIGHTED_ALGORITHM', 'MANUAL', 'RECALCULATED')),
  
  -- Freshness tracking
  last_activity_date DATE DEFAULT NULL,
  days_since_activity INTEGER GENERATED ALWAYS AS (EXTRACT(DAY FROM (CURRENT_DATE - last_activity_date))::INTEGER) STORED,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_farmer_trust_scores_category ON vault.farmer_trust_scores(trust_score_category);
CREATE INDEX idx_farmer_trust_scores_score ON vault.farmer_trust_scores(trust_score_numeric DESC);
CREATE INDEX idx_farmer_trust_scores_updated_at ON vault.farmer_trust_scores(updated_at DESC);
CREATE INDEX idx_farmer_trust_scores_calculated_at ON vault.farmer_trust_scores(calculated_at DESC);

-- Table: farmer_trust_score_history
-- Audit trail for trust score changes
CREATE TABLE IF NOT EXISTS vault.farmer_trust_score_history (
  id BIGSERIAL PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Before and after
  previous_score_numeric NUMERIC(5, 2) NOT NULL,
  new_score_numeric NUMERIC(5, 2) NOT NULL,
  score_change_numeric NUMERIC(5, 2) GENERATED ALWAYS AS (new_score_numeric - previous_score_numeric) STORED,
  
  -- Reason for change
  change_reason TEXT NOT NULL CHECK (change_reason IN (
    'INITIAL_CALCULATION',
    'COMPLETED_ORDER',
    'NEW_REVIEW',
    'DISPUTE_CREATED',
    'DISPUTE_RESOLVED',
    'ORDER_CANCELLED',
    'KYC_IMPROVEMENT',
    'PROFILE_UPDATE',
    'TIME_DECAY',
    'FRAUD_DETECTED',
    'MANUAL_ADJUSTMENT',
    'RECALCULATION'
  )),
  metadata JSONB DEFAULT NULL,
  
  -- Reference to triggering event
  related_order_id UUID DEFAULT NULL,
  related_dispute_id UUID DEFAULT NULL,
  related_review_id UUID DEFAULT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trust_history_farmer_id ON vault.farmer_trust_score_history(farmer_id, created_at DESC);
CREATE INDEX idx_trust_history_reason ON vault.farmer_trust_score_history(change_reason);
CREATE INDEX idx_trust_history_created_at ON vault.farmer_trust_score_history(created_at DESC);

-- Table: farmer_trust_score_components
-- Detailed breakdown of score calculation for explainability
CREATE TABLE IF NOT EXISTS vault.farmer_trust_score_components (
  id BIGSERIAL PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trust_score_id BIGINT NOT NULL REFERENCES vault.farmer_trust_scores(id) ON DELETE CASCADE,
  
  -- Component details
  component_name TEXT NOT NULL CHECK (component_name IN (
    'BASE_SCORE',
    'KYC_BONUS',
    'PROFILE_COMPLETENESS_BONUS',
    'DELIVERY_SUCCESS_BONUS',
    'RESPONSE_SPEED_BONUS',
    'DISPUTE_PENALTY',
    'CANCELLATION_PENALTY',
    'FRAUD_PENALTY',
    'TIME_DECAY_PENALTY'
  )),
  
  -- Point values
  weight_percentage NUMERIC(5, 2) NOT NULL,
  base_points NUMERIC(5, 2) NOT NULL,
  adjustment_points NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  final_points NUMERIC(5, 2) GENERATED ALWAYS AS (base_points + adjustment_points) STORED,
  
  -- Reason for adjustment
  adjustment_reason TEXT DEFAULT NULL,
  
  -- Supporting data for transparency
  supporting_data JSONB DEFAULT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trust_components_farmer_id ON vault.farmer_trust_score_components(farmer_id);
CREATE INDEX idx_trust_components_score_id ON vault.farmer_trust_score_components(trust_score_id);
CREATE INDEX idx_trust_components_name ON vault.farmer_trust_score_components(component_name);

-- Table: farmer_trust_score_recalculation_queue
-- Queue for async recalculation jobs
CREATE TABLE IF NOT EXISTS vault.farmer_trust_score_recalculation_queue (
  id BIGSERIAL PRIMARY KEY,
  farmer_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Job status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  
  -- Trigger reason
  trigger_reason TEXT NOT NULL,
  
  -- Priority (higher = process first)
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  
  -- Attempt tracking
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  
  -- Error handling
  last_error_message TEXT DEFAULT NULL,
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recalc_queue_status ON vault.farmer_trust_score_recalculation_queue(status, priority DESC, scheduled_at);
CREATE INDEX idx_recalc_queue_farmer_id ON vault.farmer_trust_score_recalculation_queue(farmer_id);
CREATE INDEX idx_recalc_queue_next_retry ON vault.farmer_trust_score_recalculation_queue(next_retry_at) WHERE status = 'PENDING';

-- Table: trust_score_parameters
-- Configurable scoring parameters (weights, thresholds, decay rates)
CREATE TABLE IF NOT EXISTS vault.trust_score_parameters (
  id BIGSERIAL PRIMARY KEY,
  
  -- Parameter identifiers
  parameter_name TEXT NOT NULL UNIQUE,
  parameter_category TEXT NOT NULL CHECK (parameter_category IN ('WEIGHT', 'THRESHOLD', 'BONUS', 'PENALTY', 'DECAY')),
  
  -- Value (numeric or JSON for complex configs)
  value_numeric NUMERIC(10, 4) DEFAULT NULL,
  value_text TEXT DEFAULT NULL,
  value_json JSONB DEFAULT NULL,
  
  -- Documentation
  description TEXT,
  default_value TEXT,
  
  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_params_category ON vault.trust_score_parameters(parameter_category);
CREATE INDEX idx_score_params_active ON vault.trust_score_parameters(is_active, effective_date DESC);

-- Insert default scoring parameters
INSERT INTO vault.trust_score_parameters (parameter_name, parameter_category, value_numeric, description, default_value) VALUES
  ('WEIGHT_COMPLETED_ORDERS', 'WEIGHT', 25.0, 'Weight for order completion rate', '25'),
  ('WEIGHT_AVERAGE_RATING', 'WEIGHT', 25.0, 'Weight for customer rating average', '25'),
  ('WEIGHT_FULFILLMENT_RATE', 'WEIGHT', 20.0, 'Weight for order fulfillment rate', '20'),
  ('WEIGHT_RESPONSE_TIME', 'WEIGHT', 10.0, 'Weight for response speed bonus', '10'),
  ('WEIGHT_PROFILE_COMPLETENESS', 'WEIGHT', 10.0, 'Weight for profile completeness', '10'),
  ('WEIGHT_KYC_VERIFICATION', 'WEIGHT', 15.0, 'Weight for KYC level bonus', '15'),
  ('KYC_BONUS_BASIC', 'BONUS', 5.0, 'Trust bonus for basic KYC', '5'),
  ('KYC_BONUS_VERIFIED', 'BONUS', 10.0, 'Trust bonus for verified KYC', '10'),
  ('KYC_BONUS_ADVANCED', 'BONUS', 15.0, 'Trust bonus for advanced KYC', '15'),
  ('PROFILE_COMPLETENESS_BONUS_MAX', 'BONUS', 5.0, 'Max bonus for 100% profile completeness', '5'),
  ('DELIVERY_SUCCESS_BONUS_RATE', 'BONUS', 10.0, 'Bonus per 10% delivery success rate exceeding 90%', '10'),
  ('RESPONSE_TIME_BONUS_HOURS', 'THRESHOLD', 24.0, 'Threshold for response time bonus (hours)', '24'),
  ('RESPONSE_TIME_BONUS_POINTS', 'BONUS', 5.0, 'Bonus for response time < threshold', '5'),
  ('DISPUTE_PENALTY_PER_UNRESOLVED', 'PENALTY', 10.0, 'Penalty per unresolved dispute', '10'),
  ('DISPUTE_PENALTY_MAX', 'PENALTY', 30.0, 'Maximum total dispute penalty', '30'),
  ('CANCELLATION_PENALTY_PER_CANCELLATION', 'PENALTY', 5.0, 'Penalty per cancellation', '5'),
  ('CANCELLATION_PENALTY_MAX', 'PENALTY', 20.0, 'Maximum total cancellation penalty', '20'),
  ('FRAUD_PENALTY_SEVERE', 'PENALTY', 25.0, 'Penalty for fraud detection', '25'),
  ('TIME_DECAY_RATE_PER_MONTH', 'DECAY', 0.5, 'Monthly decay rate (% per month of inactivity)', '0.5'),
  ('TIME_DECAY_MAX_PENALTY', 'DECAY', 10.0, 'Maximum penalty from time decay', '10'),
  ('TIME_DECAY_START_MONTHS', 'THRESHOLD', 6.0, 'Months of inactivity before decay starts', '6'),
  ('MIN_ORDERS_FOR_RATING', 'THRESHOLD', 5.0, 'Minimum completed orders before rating impacts score', '5'),
  ('EXCELLENT_THRESHOLD', 'THRESHOLD', 85.0, 'Score threshold for EXCELLENT rating', '85'),
  ('GOOD_THRESHOLD', 'THRESHOLD', 70.0, 'Score threshold for GOOD rating', '70'),
  ('AVERAGE_THRESHOLD', 'THRESHOLD', 50.0, 'Score threshold for AVERAGE rating', '50'),
  ('BELOW_AVERAGE_THRESHOLD', 'THRESHOLD', 30.0, 'Score threshold for BELOW_AVERAGE rating', '30')
ON CONFLICT (parameter_name) DO NOTHING;

-- View: farmer_trust_score_summary
-- Quick view for displaying trust scores with categories
CREATE OR REPLACE VIEW vault.farmer_trust_score_summary AS
SELECT
  fts.farmer_id,
  fts.trust_score_numeric,
  fts.trust_score_category,
  fts.completed_orders_count,
  fts.total_orders_count,
  fts.average_rating_numeric,
  fts.total_reviews_count,
  fts.fulfillment_rate_numeric,
  CASE
    WHEN fts.average_response_time_hours IS NOT NULL THEN fts.average_response_time_hours::TEXT || 'h'
    ELSE 'N/A'
  END AS average_response_time,
  fts.kyc_level,
  fts.profile_completeness_numeric,
  fts.dispute_count,
  fts.cancellation_count,
  fts.calculated_at,
  fts.days_since_activity
FROM vault.farmer_trust_scores fts;

-- View: trust_score_audit_trail
-- Historical view for auditing score changes
CREATE OR REPLACE VIEW vault.trust_score_audit_trail AS
SELECT
  fh.farmer_id,
  fh.previous_score_numeric,
  fh.new_score_numeric,
  fh.score_change_numeric,
  fh.change_reason,
  fh.related_order_id,
  fh.related_dispute_id,
  fh.related_review_id,
  fh.metadata,
  fh.created_at
FROM vault.farmer_trust_score_history fh
ORDER BY fh.created_at DESC;

-- View: trust_score_components_breakdown
-- Detailed breakdown for the API
CREATE OR REPLACE VIEW vault.trust_score_components_breakdown AS
SELECT
  farmer_id,
  component_name,
  weight_percentage,
  base_points,
  adjustment_points,
  final_points,
  adjustment_reason,
  supporting_data
FROM vault.farmer_trust_score_components
ORDER BY weight_percentage DESC NULLS LAST;

-- Function: safe_calculate_percentage
-- Safely calculate percentage to avoid division by zero
CREATE OR REPLACE FUNCTION vault.safe_calculate_percentage(
  numerator NUMERIC,
  denominator NUMERIC,
  default_value NUMERIC DEFAULT 0.0
) RETURNS NUMERIC AS $$
BEGIN
  IF denominator = 0 THEN
    RETURN default_value;
  END IF;
  RETURN (numerator / denominator) * 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: get_trust_score_category
-- Convert numeric score to category
CREATE OR REPLACE FUNCTION vault.get_trust_score_category(score_numeric NUMERIC)
RETURNS TEXT AS $$
BEGIN
  IF score_numeric >= 85 THEN RETURN 'EXCELLENT';
  ELSIF score_numeric >= 70 THEN RETURN 'GOOD';
  ELSIF score_numeric >= 50 THEN RETURN 'AVERAGE';
  ELSIF score_numeric >= 30 THEN RETURN 'BELOW_AVERAGE';
  ELSE RETURN 'POOR';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: queue_trust_score_recalculation
-- Queue a farmer for trust score recalculation
CREATE OR REPLACE FUNCTION vault.queue_trust_score_recalculation(
  p_farmer_id UUID,
  p_reason TEXT,
  p_priority INTEGER DEFAULT 5
) RETURNS TABLE (success BOOLEAN, message TEXT, queue_id BIGINT) AS $$
DECLARE
  v_queue_id BIGINT;
BEGIN
  INSERT INTO vault.farmer_trust_score_recalculation_queue (
    farmer_id,
    trigger_reason,
    priority,
    status
  ) VALUES (
    p_farmer_id,
    p_reason,
    p_priority,
    'PENDING'
  )
  ON CONFLICT (farmer_id) DO UPDATE SET
    trigger_reason = CONCAT(EXCLUDED.trigger_reason, ' + ', p_reason),
    priority = LEAST(EXCLUDED.priority, EXCLUDED.priority),
    status = 'PENDING',
    updated_at = NOW()
  RETURNING id INTO v_queue_id;

  RETURN QUERY SELECT true::BOOLEAN, 'Queued for recalculation'::TEXT, v_queue_id;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false::BOOLEAN, SQLERRM::TEXT, NULL::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Function: record_trust_score_change
-- Record a historical change in trust score
CREATE OR REPLACE FUNCTION vault.record_trust_score_change(
  p_farmer_id UUID,
  p_previous_score NUMERIC,
  p_new_score NUMERIC,
  p_reason TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_dispute_id UUID DEFAULT NULL,
  p_review_id UUID DEFAULT NULL
) RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
BEGIN
  INSERT INTO vault.farmer_trust_score_history (
    farmer_id,
    previous_score_numeric,
    new_score_numeric,
    change_reason,
    metadata,
    related_order_id,
    related_dispute_id,
    related_review_id
  ) VALUES (
    p_farmer_id,
    p_previous_score,
    p_new_score,
    p_reason,
    p_metadata,
    p_order_id,
    p_dispute_id,
    p_review_id
  );

  RETURN QUERY SELECT true::BOOLEAN, 'Change recorded'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false::BOOLEAN, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_farmer_trust_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_farmer_trust_scores_updated_at
BEFORE UPDATE ON vault.farmer_trust_scores
FOR EACH ROW
EXECUTE FUNCTION update_farmer_trust_scores_updated_at();

CREATE TRIGGER trigger_trust_components_updated_at
BEFORE UPDATE ON vault.farmer_trust_score_components
FOR EACH ROW
EXECUTE FUNCTION update_farmer_trust_scores_updated_at();

CREATE TRIGGER trigger_recalc_queue_updated_at
BEFORE UPDATE ON vault.farmer_trust_score_recalculation_queue
FOR EACH ROW
EXECUTE FUNCTION update_farmer_trust_scores_updated_at();

CREATE TRIGGER trigger_score_params_updated_at
BEFORE UPDATE ON vault.trust_score_parameters
FOR EACH ROW
EXECUTE FUNCTION update_farmer_trust_scores_updated_at();
