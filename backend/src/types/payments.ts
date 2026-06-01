/**
 * Payment Pipeline Types - Production-grade financial system types
 * Ensures type safety for all payment, escrow, and settlement operations
 */

// ===========================
// ESCROW TYPES
// ===========================

export type EscrowStatus = 
  | 'PENDING'      // Awaiting payment
  | 'HELD'         // Funds held after payment confirmation
  | 'RELEASED'     // Released to farmer after delivery
  | 'REFUNDED'     // Refunded to buyer
  | 'CANCELLED'    // Cancelled/disputed
  | 'DISPUTED';    // Under dispute resolution

export interface EscrowAccount {
  id: number;
  escrow_id: string;
  order_id: string;
  farmer_id: string;
  buyer_id: string;
  
  // Status
  escrow_status: EscrowStatus;
  version: number; // For optimistic locking
  
  // Amounts in paise (integers for precision)
  total_amount_paise: number; // Stored as bigint
  subtotal_paise: number;
  commission_paise: number;
  commission_percentage: number; // 2.00 or 3.00
  is_premium: boolean;
  
  // Razorpay integration
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_hold_id?: string;
  
  // Timeline
  release_requested_at?: string;
  release_approved_at?: string;
  release_completed_at?: string;
  release_failed_reason?: string;
  
  refund_requested_at?: string;
  refund_reason?: string;
  refund_approved_at?: string;
  refund_completed_at?: string;
  refund_failed_reason?: string;
  refund_amount_paise?: number;
  
  // Compensation
  compensation_amount_paise: number;
  compensation_reason?: string;
  compensation_approved_at?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface EscrowLifecycleEvent {
  escrow_id: string;
  from_status: EscrowStatus;
  to_status: EscrowStatus;
  event_type: 'PAYMENT_CAPTURED' | 'DELIVERY_CONFIRMED' | 'REFUND_REQUESTED' | 'DISPUTE_FILED' | 'COMPENSATION_ISSUED' | 'HOLDER_OVERRIDE';
  timestamp: string;
  metadata: Record<string, unknown>;
  triggered_by?: string; // user_id or system
}

// ===========================
// PAYMENT & LEDGER TYPES
// ===========================

export type TransactionType = 
  | 'PAYMENT_CAPTURED'
  | 'ESCROW_HELD'
  | 'ESCROW_RELEASED'
  | 'REFUND_INITIATED'
  | 'REFUND_COMPLETED'
  | 'COMPENSATION'
  | 'COMMISSION_DEDUCTED'
  | 'TDS_DEDUCTED';

export interface PaymentLedgerEntry {
  id: number;
  transaction_id: string;
  ledger_hash: string;
  prev_ledger_hash?: string;
  
  order_id: string;
  escrow_id?: string;
  farmer_id: string;
  buyer_id: string;
  
  txn_type: TransactionType;
  
  // Amounts in paise (all integers)
  amount_paise: number;
  commission_paise: number;
  tds_deducted_paise: number;
  net_payout_paise?: number;
  
  // Razorpay references
  razorpay_payment_id?: string;
  razorpay_payout_id?: string;
  razorpay_refund_id?: string;
  
  // Running balance for verification
  running_balance_paise?: number;
  
  // Metadata
  metadata?: Record<string, unknown>;
  
  // Audit
  created_at: string;
  hash_verified_at?: string;
}

export interface LedgerHashChain {
  verified: boolean;
  broken_at_id?: number;
  issue_description?: string;
  total_entries: number;
}

// ===========================
// WEBHOOK TYPES
// ===========================

export type WebhookProcessingStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DEAD_LETTER';

export interface WebhookEvent {
  id: number;
  webhook_event_id: string; // Razorpay event_id for idempotency
  webhook_signature: string;
  
  event_type: string;
  payload: Record<string, unknown>;
  
  processing_status: WebhookProcessingStatus;
  attempt_count: number;
  last_attempt_at?: string;
  last_error?: string;
  
  // Result tracking
  transaction_id?: string;
  
  // Compensation flag
  required_compensation: boolean;
  compensation_amount_paise?: number;
  
  // Timestamps
  created_at: string;
  completed_at?: string;
}

export interface RazorpayWebhookPayload {
  event: string;
  created_at: number;
  payload: {
    payment?: {
      entity: RazorpayPayment;
    };
    order?: {
      entity: RazorpayOrder;
    };
    refund?: {
      entity: RazorpayRefund;
    };
  };
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number; // in paise
  currency: 'INR';
  status: string;
  method: string;
  notes: Record<string, unknown>;
  vpa?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number; // in paise
  amount_paid: number;
  amount_due: number;
  currency: 'INR';
  receipt: string;
  status: 'created' | 'paid' | 'attempted';
  notes: Record<string, unknown>;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: 'INR';
  status: 'processed' | 'failed' | 'pending';
  notes: Record<string, unknown>;
}

// ===========================
// COMMISSION TYPES
// ===========================

export interface CommissionConfig {
  id: number;
  commission_name: string;
  commission_percentage: number; // e.g., 2.00 for 2%
  is_active: boolean;
  
  // Eligibility
  min_monthly_sales_paise?: number;
  min_trust_score?: number;
  requires_cold_storage?: boolean;
  organic_products_only?: boolean;
  
  // Dates
  effective_from: string;
  effective_to?: string;
  
  // Metadata
  description?: string;
  metadata?: Record<string, unknown>;
  
  created_at: string;
  updated_at: string;
}

export interface CommissionCalculation {
  subtotal_paise: number;
  commission_percentage: number;
  commission_name: string;
  commission_paise: number; // Calculated exactly
  total_paise: number;
  is_premium: boolean;
}

// ===========================
// SETTLEMENT TYPES
// ===========================

export type SettlementStatus = 
  | 'PENDING'
  | 'APPROVED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export interface Settlement {
  id: number;
  settlement_id: string;
  farmer_id: string;
  
  settlement_period_start: string; // Date
  settlement_period_end: string;
  
  // Amounts in paise
  total_sales_paise: number;
  total_commission_paise: number;
  total_tds_paise: number;
  total_refunds_paise: number;
  net_payout_paise: number;
  
  // Status
  settlement_status: SettlementStatus;
  
  // Payout details
  razorpay_payout_id?: string;
  razorpay_payout_status?: string;
  bank_transfer_at?: string;
  
  // Validation
  ledger_entries_count?: number;
  ledger_hash_verified?: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface SettlementCalculation {
  farmer_id: string;
  period_start: string;
  period_end: string;
  
  total_sales_paise: number;
  total_commission_paise: number;
  total_tds_paise: number;
  total_refunds_paise: number;
  
  net_payout_paise: number; // sales - commission - tds - refunds
  
  orders_count: number;
  refunds_count: number;
  
  ledger_entries: PaymentLedgerEntry[];
}

// ===========================
// REFUND TYPES
// ===========================

export type RefundStatus = 
  | 'INITIATED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'MANUAL_REVIEW';

export type RefundType = 'FULL' | 'PARTIAL' | 'COMPENSATION';

export type RefundReason = 
  | 'DELIVERY_FAILED'
  | 'QUALITY_ISSUE'
  | 'BUYER_REQUEST'
  | 'ORDER_CANCELLED'
  | 'DUPLICATE_CHARGE'
  | 'CHARGEBACK'
  | 'COMPENSATION';

export interface Refund {
  id: number;
  refund_id: string;
  order_id: string;
  buyer_id: string;
  
  refund_amount_paise: number;
  refund_reason: RefundReason;
  refund_type: RefundType;
  
  // Status tracking
  refund_status: RefundStatus;
  
  // Razorpay integration
  razorpay_refund_id?: string;
  razorpay_refund_status?: string;
  
  // Timing
  requested_at: string;
  approved_at?: string;
  completed_at?: string;
  
  // Error tracking
  failure_reason?: string;
  failure_count: number;
  
  created_at: string;
  updated_at: string;
}

// ===========================
// PAYOUT RETRY TYPES
// ===========================

export type FailedPayoutStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'MANUAL_REVIEW';

export interface FailedPayout {
  id: number;
  payout_id: string;
  farmer_id: string;
  order_id?: string;
  
  amount_paise: number;
  payout_reason: string;
  
  // Retry tracking
  retry_count: number;
  max_retries: number;
  backoff_multiplier: number;
  
  // Scheduling
  next_retry_at: string;
  last_attempted_at?: string;
  last_error?: string;
  
  // New payout if retried
  new_razorpay_payout_id?: string;
  
  status: FailedPayoutStatus;
  
  created_at: string;
  updated_at: string;
}

// ===========================
// RECONCILIATION TYPES
// ===========================

export type ReconciliationStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VARIANCE_FOUND';

export interface PaymentReconciliation {
  id: number;
  reconciliation_id: string;
  
  reconciliation_date: string;
  
  // Transaction counts
  razorpay_transactions_count?: number;
  db_transactions_count?: number;
  
  // Amounts in paise
  razorpay_total_amount_paise?: number;
  db_total_amount_paise?: number;
  variance_paise?: number;
  
  // Status
  status: ReconciliationStatus;
  
  notes?: string;
  discrepancies?: Record<string, unknown>;
  
  created_at: string;
  completed_at?: string;
}

// ===========================
// REQUEST/RESPONSE TYPES
// ===========================

export interface ReleaseEscrowRequest {
  escrow_id: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ReleaseEscrowResponse {
  success: boolean;
  escrow_id: string;
  new_status: EscrowStatus;
  transaction_id: string;
  farmer_payout_paise: number;
  message: string;
}

export interface RefundRequest {
  order_id: string;
  refund_amount_paise?: number; // Omit for full refund
  reason: RefundReason;
  metadata?: Record<string, unknown>;
}

export interface RefundResponse {
  success: boolean;
  refund_id: string;
  order_id: string;
  refund_amount_paise: number;
  status: RefundStatus;
  razorpay_refund_id?: string;
  message: string;
}

// ===========================
// ERROR TYPES
// ===========================

export interface PaymentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export class InsufficientFundsError extends Error {
  code = 'INSUFFICIENT_FUNDS';
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

export class IdempotencyError extends Error {
  code = 'IDEMPOTENCY_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

export class WebhookVerificationError extends Error {
  code = 'WEBHOOK_VERIFICATION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export class LedgerChainError extends Error {
  code = 'LEDGER_CHAIN_BROKEN';
  constructor(message: string) {
    super(message);
    this.name = 'LedgerChainError';
  }
}

// ===========================
// UTILITY TYPES
// ===========================

export interface FinancialPrecision {
  amount_paise: number;
  formatted_inr: string; // "1234.56"
  currency: 'INR';
}

export interface PaiseAmount {
  paise: number;
  inr: () => number; // Gets INR value
  toString: () => string; // "1234.56 INR"
}
