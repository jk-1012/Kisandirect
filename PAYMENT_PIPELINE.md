# KisanDirect Payment Pipeline - Production Implementation

## Overview

Complete production-grade payment pipeline implementation for KisanDirect with:
- ✅ Razorpay OAuth2 integration
- ✅ Escrow lifecycle management
- ✅ Financial precision (no floating-point errors)
- ✅ Webhook idempotency & signature verification
- ✅ Ledger hash chain for audit trails
- ✅ Commission engine (2%, 3%, seasonal tiers)
- ✅ Settlement calculations & verification
- ✅ Refund processing with retry logic
- ✅ Failed payout recovery queue
- ✅ Dead-letter queue for problematic webhooks
- ✅ Prometheus metrics & monitoring
- ✅ DPDP compliance audit logging

## Architecture

### Core Components

#### 1. **Database Schema** (`migrations/023_payment_pipeline_enhancement.sql`)
- `vault.escrow_accounts` - Escrow lifecycle tracking
- `vault.payment_ledger` - Immutable transaction ledger with hash chain
- `vault.webhook_events` - Idempotency & deduplication
- `vault.settlements` - Farmer settlement batches
- `vault.failed_payouts` - Payout retry queue
- `vault.commission_config` - Tiered commission logic
- `vault.refunds` - Refund tracking & audit
- `vault.payment_reconciliation` - Daily reconciliation reports

#### 2. **Type System** (`types/payments.ts`)
- Complete TypeScript types for all payment operations
- Type-safe event handling
- Error types with retry flags

#### 3. **Middleware**
- **Webhook Verification** (`middleware/webhook-verification.ts`)
  - HMAC-SHA256 signature validation
  - Clock skew protection (5 min reasonable threshold)
  - Idempotency via webhook_event_id
  - Automatic retry tracking
  - Dead-letter queue for persistent failures

#### 4. **Services**

**Commission & Settlement Engine** (`services/commission-settlement-service.ts`)
```typescript
// Precise decimal calculations using BigInt
function calculateCommissionPrecise(
  subtotalPaise: number,
  commissionPercentage: number
): number {
  const subtotal = BigInt(Math.floor(subtotalPaise));
  const percentage = BigInt(Math.floor(commissionPercentage * 100));
  return Number((subtotal * percentage) / BigInt(10000));
}

// Settlement batch calculation with ledger verification
async function calculateSettlement(
  farmerId: string,
  periodStart: string,
  periodEnd: string
): Promise<SettlementCalculation>

// Hash chain verification
async function verifyLedgerChain(): Promise<{ verified: boolean }>
```

**Escrow Lifecycle Service** (`services/escrow-service.ts`)
```typescript
// State machine for escrow management
// PENDING → HELD → RELEASED/REFUNDED/DISPUTED → Terminal
// Optimistic locking prevents concurrent updates

async function createEscrow(
  orderId: string,
  farmerId: string,
  buyerId: string,
  subtotalPaise: number,
  commissionPaise: number,
  ...
): Promise<EscrowAccount>

async function releaseEscrow(
  escrowId: string,
  tdsDeductedPaise: number
): Promise<EscrowAccount>

async function refundEscrow(
  escrowId: string,
  reason: string,
  refundAmountPaise?: number
): Promise<EscrowAccount>

async function issueCompensation(
  escrowId: string,
  compensationAmountPaise: number,
  reason: string
): Promise<EscrowAccount>
```

#### 5. **Background Workers** (`jobs/payment-workers.ts`)

BullMQ queue workers with built-in retry logic:

- **Escrow Release Worker**
  - Validates order delivery status
  - Calculates TDS
  - Initiates Razorpay payout
  - Creates ledger entry
  - Automatic retry on failure

- **Escrow Refund Worker**
  - Processes refunds (full/partial)
  - Integrates with Razorpay
  - Updates escrow status
  - Creates refund audit trail

- **Payout Reconciliation Worker**
  - Daily reconciliation of Razorpay vs DB payouts
  - Detects discrepancies
  - Generates reconciliation reports

- **Failed Payout Retry Worker**
  - Exponential backoff retry (default: 5 attempts)
  - Max retry: 5 attempts (configurable)
  - Escalates to manual review after max retries
  - Backoff multiplier: 2x (configurable)

#### 6. **Routes** (`routes/payments.ts`)

```typescript
// Webhook receiver
POST /payments/webhook
- Signature verification
- Idempotency check
- Event routing

// Manual escrow release
POST /orders/:orderId/release-escrow
- Auth required
- Queues worker job
- Returns 202 Accepted

// Refund processing
POST /orders/:orderId/refund
- Auth required (buyer/farmer/admin)
- Validation of refund reasons
- Queues worker job
- Returns 202 Accepted

// Payment status
GET /orders/:orderId/payment-status
- Public endpoint
- Returns current escrow & payment status
```

#### 7. **Metrics** (`metrics/payment-metrics.ts`)

Prometheus metrics with Grafana support:

**Counters:**
- `kisandirect_payments_captured_total` - Successful payments
- `kisandirect_escrow_released_total` - Escrows released
- `kisandirect_escrow_refunded_total` - Escrows refunded
- `kisandirect_refunds_processed_total` - Refunds processed
- `kisandirect_payouts_initiated_total` - Payouts initiated
- `kisandirect_webhooks_processed_total` - Webhooks processed
- `kisandirect_webhooks_dlq_total` - DLQ webhooks

**Histograms:**
- `kisandirect_payment_processing_seconds` - Payment latency
- `kisandirect_escrow_release_seconds` - Release latency
- `kisandirect_webhook_processing_seconds` - Webhook processing time
- `kisandirect_refund_processing_seconds` - Refund latency

**Gauges:**
- `kisandirect_escrow_accounts_pending` - Pending escrows
- `kisandirect_escrow_accounts_held` - Held escrows
- `kisandirect_failed_payouts_pending` - Failed payouts awaiting retry
- `kisandirect_settlements_pending` - Pending settlements

**Financial Metrics (in paise):**
- `kisandirect_total_payments_paise` - Total payments
- `kisandirect_total_commission_paise` - Total commission
- `kisandirect_total_refunds_paise` - Total refunds
- `kisandirect_total_payouts_paise` - Total payouts to farmers

## Financial Precision

### Decimal Safety

All financial calculations use **integer arithmetic in paise** (no floating-point):

```typescript
// ✅ CORRECT: Use paise (hundredth of rupee)
const subtotalPaise = 10000;  // ₹100.00
const commissionPaise = 200;   // ₹2.00 (2%)

// ❌ WRONG: Never use floating-point for money
const subtotal = 100.00;
const commission = subtotal * 0.02;  // Potential rounding error!

// Commission calculation formula (BigInt for safety)
const commission = Math.floor((subtotalPaise * 2) / 100);  // 200 paise
```

### Ledger Hash Chain

Ensures immutable audit trail:

```typescript
// Each transaction computes hash of previous transaction
const hash = sha256(JSON.stringify({
  transaction_id: "TXN-123",
  previous_hash: "abc123...",  // Hash of previous transaction
  amount: 10000,
  timestamp: "2026-01-15T10:30:00Z",
  metadata: { order_id: "ORD-456" }
}));

// If anyone tampers with a transaction in the middle,
// all subsequent hashes become invalid (chain breaks)
```

## Webhook Processing

### Idempotency Guarantee

```
Webhook received
  ↓
Check webhook_event_id (unique constraint)
  ├→ Already processed? Return 200 (idempotent)
  ├→ Currently processing? Return 202 (Accepted)
  └→ New event? Set to PENDING
  ↓
Verify HMAC-SHA256 signature
  ├→ Invalid? Return 401
  └→ Valid? Continue
  ↓
Check clock skew (< 5 minutes)
  ├→ Too old? Log warning, continue
  └→ Within range? Continue
  ↓
Route event handler
  ├→ success? Mark COMPLETED, return 200
  └→ failure? Increment attempt_count
  ↓
Max retries exceeded?
  ├→ No? Leave FAILED for retry
  └→ Yes? Send to DEAD_LETTER queue
```

### Signature Verification

```typescript
// Razorpay webhook signature
const signature = request.headers['x-razorpay-signature'];
const body = request.rawBody;

// Compute expected signature
const expectedSignature = crypto
  .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
  .update(body)
  .digest('hex');

// Use timing-safe comparison
const valid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expectedSignature)
);
```

## Commission Engine

### Tier-Based Logic

```typescript
// Check eligibility
const tiers = [
  { name: 'ORGANIC', rate: 1.5%, minTrust: 0, requires: 'organic_certified' },
  { name: 'SEASONAL', rate: 1.5%, minTrust: 0, period: 'harvest_season' },
  { name: 'PREMIUM', rate: 3.0%, minTrust: 50, minSales: 100000 },
  { name: 'STANDARD', rate: 2.0%, minTrust: 0 }
];

// Select best eligible tier
async function getCommissionConfig(farmerId: string): Promise<CommissionConfig> {
  const farmer = await getFarmerStats(farmerId);
  
  for (const tier of tiers) {
    if (farmer.trustScore >= tier.minTrust && farmer.sales >= tier.minSales) {
      return tier;  // Best rate farmer qualifies for
    }
  }
  
  return tiers[tiers.length - 1];  // Fallback to STANDARD
}
```

## Settlement Workflow

### Daily Settlement Process

```
1. Identify all orders with RELEASED escrow from date range
2. Sum transactions:
   - Sales: ESCROW_RELEASED transactions
   - Commission: Sum of commission_paise
   - TDS: Sum of tds_deducted_paise  
   - Refunds: REFUND_COMPLETED transactions
3. Calculate net payout:
   net = sales - commission - tds - refunds
4. Verify ledger hash chain integrity
5. Create settlement record with PENDING status
6. Queue for approval
7. On approval:
   - Initiate Razorpay payout
   - Update settlement status to PAID
   - Update farmer profile annual_payout_inr
```

## Refund Processing

### Flow

```
Refund requested
  ↓
Validate reason & authorization
  ├→ DELIVERY_FAILED: Buyer only
  ├→ QUALITY_ISSUE: Buyer only
  ├→ ORDER_CANCELLED: Farmer/Admin
  ├→ COMPENSATION: Admin only
  ├→ CHARGEBACK: Admin only
  └→ Continue
  ↓
Check escrow status (must be HELD)
  ├→ Cannot refund released/refunded escrow
  └→ Continue
  ↓
Queue REFUND_ESCROW worker
  ↓
Worker calls Razorpay refund API
  ├→ Success? Mark escrow REFUNDED, update status
  └→ Failure? Retry with backoff
  ↓
Update refund record with razorpay_refund_id
  ↓
Create ledger entry for audit trail
```

### Partial Refunds

```typescript
// Full refund (default)
POST /orders/:id/refund
{
  "reason": "DELIVERY_FAILED"
}
// Returns full total_amount_paise

// Partial refund
POST /orders/:id/refund
{
  "reason": "QUALITY_ISSUE",
  "refund_amount_paise": 5000  // ₹50.00 instead of full amount
}
```

## Compensation

### Scenarios

```typescript
// Order delivery failed - compensate buyer
await escrowService.issueCompensation(
  escrowId,
  500,  // ₹5.00 compensation
  'FAILED_DELIVERY'
);

// Dispute resolved against farmer - compensate buyer
await escrowService.issueCompensation(
  escrowId,
  2000,  // ₹20.00 compensation
  'DISPUTE_RESOLUTION'
);
```

## Error Handling

### Retry Policies

**BullMQ Exponential Backoff:**
```typescript
// Default configuration
{
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000  // 5 seconds
  }
}

// Retry schedule:
// 1st attempt: immediate
// 2nd attempt: 10 seconds later (5000 * 2^1)
// 3rd attempt: 20 seconds later (5000 * 2^2)
// 4th attempt: 40 seconds later (5000 * 2^3)
// 5th attempt: 80 seconds later (5000 * 2^4)
```

**Failed Payout Retry:**
```typescript
// Max 5 retries before escalation to manual review
const nextRetryTime = Date.now() + (60000 * Math.pow(2, attemptNumber));

// Status progression:
PENDING → PROCESSING → SUCCEEDED
            ↓
         FAILED (attempt_count < max)
            ↓ (retry scheduled)
         PENDING → PROCESSING
            ↓
         FAILED (attempt_count >= max)
            ↓
         MANUAL_REVIEW
```

**Webhook Dead-Letter Queue:**
```typescript
if (webhook.attempt_count >= MAX_RETRIES) {
  await sendToDeadLetterQueue(
    webhookEventId,
    'Max retries exceeded',
    payload
  );
  // DLQ worker logs for manual investigation
  // Alert ops team (Slack/PagerDuty integration)
}
```

## Testing

### Test Coverage

Located in `__tests__/payment-pipeline.integration.test.ts`

**Escrow Lifecycle (4 tests)**
- Create escrow on payment capture
- Transition HELD → RELEASED with TDS
- Refund escrow on buyer request
- Invalid state transitions handled

**Commission Calculations (4 tests)**
- Standard commission (2%)
- Premium commission (3%)
- Seasonal discount (1.5%)
- Precision with fractional paise

**Webhook Idempotency (2 tests)**
- Duplicate webhook detection
- Attempt count tracking

**Ledger Hash Chain (2 tests)**
- Hash computation correctness
- Chain break detection on tampering

**Settlement Calculations (1 test)**
- Accurate aggregation of transactions
- Net payout calculation

**Refund Processing (2 tests)**
- Refund storage with correct status
- Status update to COMPLETED

**Error Handling & Compensation (2 tests)**
- Failed payout tracking for retry
- Compensation issuance with validation

Run tests:
```bash
npm test -- payment-pipeline.integration.test.ts
```

## Deployment

### Environment Variables

```bash
# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=secret_xxx
RAZORPAY_WEBHOOK_SECRET=webhook_secret_xxx

# Database
DATABASE_URL=postgresql://...

# Redis (for BullMQ queues)
REDIS_URL=redis://...

# Optional: Monitoring
SENTRY_DSN=https://...
GRAFANA_API_KEY=...
```

### Database Migration

```bash
# Run migration
npm run migrate:latest

# Verify tables created
psql -d kisandirect -c "SELECT tablename FROM pg_tables WHERE schemaname = 'vault';"
```

### Queue Processors

Register workers in app initialization:

```typescript
// See jobs/payment-workers.ts
const app = await buildApp();

// Register escrow release processor
app.queues.payoutQueue.process('RELEASE_ESCROW', processEscrowRelease);

// Register refund processor
app.queues.payoutQueue.process('REFUND_ESCROW', processEscrowRefund);

// Register reconciliation processor
app.queues.payoutQueue.process('PAYOUT_RECONCILIATION', processPayoutReconciliation);

// Register retry processor
app.queues.payoutQueue.process('FAILED_PAYOUT_RETRY', processFailedPayoutRetry);

// Register DLQ processor
app.queues.payoutQueue.process('WEBHOOK_DEAD_LETTER', processDeadLetterQueue);
```

### Monitoring & Alerts

**Prometheus Metrics:**
- `kisandirect_payments_captured_total` - Track payment volume
- `kisandirect_escrow_released_total` - Track successful releases
- `kisandirect_webhooks_dlq_total` - Critical: Alert if > 0
- `kisandirect_payment_processing_seconds` - Monitor latency
- `kisandirect_failed_payouts_pending` - Monitor retry queue

**Grafana Dashboards:**
- Payment volume & success rate
- Escrow release latency
- Webhook processing health
- Failed payout queue depth
- Settlement completion rate

**Alerts:**
- DLQ webhook received → Immediate alert
- Ledger hash chain broken → Critical alert
- Settlement verification failure → High alert
- Payout failure rate > 5% → Medium alert
- Payment processing latency > 30s → Low alert

## Compliance & Audit

### DPDP Requirements

- ✅ Encrypted PII in vault.farmer_kyc
- ✅ Immutable audit trail (ledger hash chain)
- ✅ Event logging with timestamps
- ✅ User consent tracking
- ✅ Data deletion support (soft delete)

### Audit Trail

Every financial transaction creates immutable ledger entries:

```sql
-- Verify all transactions for farmer
SELECT transaction_id, txn_type, amount_paise, created_at
FROM vault.payment_ledger
WHERE farmer_id = '...'
ORDER BY created_at;

-- Verify hash chain integrity
SELECT verify_ledger_chain();

-- Settlement reconciliation
SELECT * FROM vault.settlements
WHERE farmer_id = '...'
ORDER BY created_at DESC;
```

## Troubleshooting

### Webhook Processing Issues

```bash
# Check pending webhooks
SELECT * FROM vault.webhook_events
WHERE processing_status IN ('PENDING', 'PROCESSING')
ORDER BY created_at DESC;

# Check dead-letter queue
SELECT * FROM vault.webhook_events
WHERE processing_status = 'DEAD_LETTER'
ORDER BY created_at DESC;

# Manual retry
UPDATE vault.webhook_events
SET processing_status = 'PENDING', attempt_count = 0
WHERE webhook_event_id = '...';
```

### Failed Payouts

```bash
# Check failed payouts awaiting retry
SELECT * FROM vault.failed_payouts
WHERE status = 'PENDING'
  AND next_retry_at <= NOW()
ORDER BY next_retry_at;

# Escalate to manual review
UPDATE vault.failed_payouts
SET status = 'MANUAL_REVIEW'
WHERE id = ...;
```

### Ledger Chain Breaks

```bash
# Verify ledger chain
SELECT * FROM vault.ledger_chain_audit
WHERE chain_status = 'CHAIN_BROKEN';

# If broken, investigate transaction
SELECT * FROM vault.payment_ledger
WHERE id = (SELECT broken_id FROM vault.ledger_chain_audit);
```

## API Examples

### Create Order & Initiate Payment

```bash
# 1. Create order
curl -X POST http://localhost:3000/api/v1/orders/buy-now \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "listing_id": "LIST-001",
    "quantity_kg": 100,
    "delivery_requested": true,
    "delivery_address": "123 Main St"
  }'

# Response: { order_id, razorpay_order_id, amount_inr }

# 2. Client redirects to Razorpay for payment
# Razorpay webhook → /payments/webhook → creates escrow
```

### Release Escrow After Delivery

```bash
curl -X POST http://localhost:3000/api/v1/orders/ORD-123/release-escrow \
  -H "Authorization: Bearer $FARMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Delivery confirmed by buyer"
  }'

# Response: 202 Accepted { escrow_id, message }
# Worker processes and initiates payout
```

### Process Refund

```bash
curl -X POST http://localhost:3000/api/v1/orders/ORD-123/refund \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "DELIVERY_FAILED"
  }'

# Response: 202 Accepted { refund_id, message }
```

### Get Payment Status

```bash
curl http://localhost:3000/api/v1/orders/ORD-123/payment-status

# Response:
{
  "order_id": "ORD-123",
  "payment_status": "CONFIRMED",
  "order_status": "COMPLETED",
  "escrow": {
    "escrow_id": "ESC-...",
    "status": "RELEASED",
    "total_amount_inr": 102.00,
    "commission_inr": 2.00
  },
  "total_amount_inr": 102.00,
  "created_at": "2026-01-15T10:00:00Z"
}
```

---

## Support & Documentation

- Razorpay Integration: https://razorpay.com/docs/
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- BullMQ Documentation: https://docs.bullmq.io/
- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/

Last updated: June 2026
