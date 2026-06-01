/**
 * Payment Pipeline Metrics
 * 
 * Prometheus metrics for monitoring payment operations
 * - Transaction counts and latencies
 * - Escrow lifecycle events
 * - Success/failure rates
 * - Webhook processing metrics
 * - Settlement metrics
 * - Commission tracking
 */

import { FastifyInstance } from 'fastify';
import { Counter, Histogram, Gauge, register } from 'prom-client';

export interface PaymentMetrics {
  // Counters
  orders_created_total: Counter;
  payments_captured_total: Counter;
  payments_failed_total: Counter;
  escrow_released_total: Counter;
  escrow_refunded_total: Counter;
  refunds_processed_total: Counter;
  payouts_initiated_total: Counter;
  payouts_failed_total: Counter;
  compensation_issued_total: Counter;
  webhooks_received_total: Counter;
  webhooks_processed_total: Counter;
  webhooks_failed_total: Counter;
  webhooks_dlq_total: Counter;

  // Histograms (latencies)
  payment_processing_seconds: Histogram;
  escrow_release_seconds: Histogram;
  webhook_processing_seconds: Histogram;
  refund_processing_seconds: Histogram;
  payout_processing_seconds: Histogram;

  // Gauges (current states)
  escrow_accounts_pending: Gauge;
  escrow_accounts_held: Gauge;
  failed_payouts_pending: Gauge;
  settlements_pending: Gauge;

  // Financial metrics (in paise)
  total_payments_paise: Counter;
  total_commission_paise: Counter;
  total_refunds_paise: Counter;
  total_payouts_paise: Counter;
  total_compensation_paise: Counter;

  // Error metrics
  webhook_signature_verification_failures: Counter;
  ledger_chain_breaks: Counter;
  settlement_verification_failures: Counter;
}

export function createPaymentMetrics(server: FastifyInstance): PaymentMetrics {
  return {
    // ===========================
    // COUNTERS
    // ===========================

    orders_created_total: new Counter({
      name: 'kisandirect_orders_created_total',
      help: 'Total orders created',
      labelNames: ['order_type']
    }),

    payments_captured_total: new Counter({
      name: 'kisandirect_payments_captured_total',
      help: 'Total payments captured successfully',
      labelNames: ['method', 'currency']
    }),

    payments_failed_total: new Counter({
      name: 'kisandirect_payments_failed_total',
      help: 'Total payments that failed',
      labelNames: ['reason']
    }),

    escrow_released_total: new Counter({
      name: 'kisandirect_escrow_released_total',
      help: 'Total escrows released to farmers',
      labelNames: []
    }),

    escrow_refunded_total: new Counter({
      name: 'kisandirect_escrow_refunded_total',
      help: 'Total escrows refunded to buyers',
      labelNames: ['reason']
    }),

    refunds_processed_total: new Counter({
      name: 'kisandirect_refunds_processed_total',
      help: 'Total refunds processed',
      labelNames: ['type', 'status']
    }),

    payouts_initiated_total: new Counter({
      name: 'kisandirect_payouts_initiated_total',
      help: 'Total payouts initiated to farmers',
      labelNames: ['method']
    }),

    payouts_failed_total: new Counter({
      name: 'kisandirect_payouts_failed_total',
      help: 'Total payouts that failed',
      labelNames: ['reason']
    }),

    compensation_issued_total: new Counter({
      name: 'kisandirect_compensation_issued_total',
      help: 'Total compensation amounts issued',
      labelNames: ['reason']
    }),

    webhooks_received_total: new Counter({
      name: 'kisandirect_webhooks_received_total',
      help: 'Total webhooks received',
      labelNames: ['event_type', 'source']
    }),

    webhooks_processed_total: new Counter({
      name: 'kisandirect_webhooks_processed_total',
      help: 'Total webhooks successfully processed',
      labelNames: ['event_type']
    }),

    webhooks_failed_total: new Counter({
      name: 'kisandirect_webhooks_failed_total',
      help: 'Total webhooks that failed processing',
      labelNames: ['event_type', 'reason']
    }),

    webhooks_dlq_total: new Counter({
      name: 'kisandirect_webhooks_dlq_total',
      help: 'Total webhooks sent to dead-letter queue',
      labelNames: ['event_type']
    }),

    // ===========================
    // HISTOGRAMS (LATENCIES)
    // ===========================

    payment_processing_seconds: new Histogram({
      name: 'kisandirect_payment_processing_seconds',
      help: 'Payment processing latency in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      labelNames: ['status']
    }),

    escrow_release_seconds: new Histogram({
      name: 'kisandirect_escrow_release_seconds',
      help: 'Escrow release latency in seconds',
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      labelNames: ['status']
    }),

    webhook_processing_seconds: new Histogram({
      name: 'kisandirect_webhook_processing_seconds',
      help: 'Webhook processing latency in seconds',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      labelNames: ['event_type', 'status']
    }),

    refund_processing_seconds: new Histogram({
      name: 'kisandirect_refund_processing_seconds',
      help: 'Refund processing latency in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      labelNames: ['status']
    }),

    payout_processing_seconds: new Histogram({
      name: 'kisandirect_payout_processing_seconds',
      help: 'Payout processing latency in seconds',
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      labelNames: ['status']
    }),

    // ===========================
    // GAUGES (CURRENT STATES)
    // ===========================

    escrow_accounts_pending: new Gauge({
      name: 'kisandirect_escrow_accounts_pending',
      help: 'Number of escrow accounts in PENDING status'
    }),

    escrow_accounts_held: new Gauge({
      name: 'kisandirect_escrow_accounts_held',
      help: 'Number of escrow accounts in HELD status'
    }),

    failed_payouts_pending: new Gauge({
      name: 'kisandirect_failed_payouts_pending',
      help: 'Number of failed payouts pending retry'
    }),

    settlements_pending: new Gauge({
      name: 'kisandirect_settlements_pending',
      help: 'Number of settlements pending approval'
    }),

    // ===========================
    // FINANCIAL METRICS (PAISE)
    // ===========================

    total_payments_paise: new Counter({
      name: 'kisandirect_total_payments_paise',
      help: 'Total payments in paise',
      labelNames: ['currency']
    }),

    total_commission_paise: new Counter({
      name: 'kisandirect_total_commission_paise',
      help: 'Total commission collected in paise',
      labelNames: ['tier']
    }),

    total_refunds_paise: new Counter({
      name: 'kisandirect_total_refunds_paise',
      help: 'Total refunds processed in paise',
      labelNames: ['reason']
    }),

    total_payouts_paise: new Counter({
      name: 'kisandirect_total_payouts_paise',
      help: 'Total payouts to farmers in paise',
      labelNames: []
    }),

    total_compensation_paise: new Counter({
      name: 'kisandirect_total_compensation_paise',
      help: 'Total compensation issued in paise',
      labelNames: ['reason']
    }),

    // ===========================
    // ERROR METRICS
    // ===========================

    webhook_signature_verification_failures: new Counter({
      name: 'kisandirect_webhook_signature_verification_failures',
      help: 'Number of webhook signature verification failures'
    }),

    ledger_chain_breaks: new Counter({
      name: 'kisandirect_ledger_chain_breaks',
      help: 'Number of times ledger hash chain integrity was violated'
    }),

    settlement_verification_failures: new Counter({
      name: 'kisandirect_settlement_verification_failures',
      help: 'Number of settlement verification failures'
    })
  };
}

export type PaymentMetricsService = ReturnType<typeof createPaymentMetrics>;

/**
 * Helper function to update metrics for a payment event
 */
export function recordPaymentEvent(
  metrics: PaymentMetrics,
  event: {
    type: 'PAYMENT_CAPTURED' | 'PAYMENT_FAILED' | 'ESCROW_RELEASED' | 'ESCROW_REFUNDED' | 'REFUND' | 'PAYOUT' | 'COMPENSATION';
    status: 'SUCCESS' | 'FAILURE';
    amountPaise: number;
    commissionPaise?: number;
    processingTimeSeconds?: number;
    reason?: string;
    tier?: string;
  }
) {
  switch (event.type) {
    case 'PAYMENT_CAPTURED':
      metrics.payments_captured_total.labels('razorpay', 'INR').inc();
      metrics.total_payments_paise.labels('INR').inc(event.amountPaise);
      if (event.processingTimeSeconds) {
        metrics.payment_processing_seconds.labels('success').observe(event.processingTimeSeconds);
      }
      break;

    case 'PAYMENT_FAILED':
      metrics.payments_failed_total.labels(event.reason || 'unknown').inc();
      if (event.processingTimeSeconds) {
        metrics.payment_processing_seconds.labels('failure').observe(event.processingTimeSeconds);
      }
      break;

    case 'ESCROW_RELEASED':
      metrics.escrow_released_total.inc();
      metrics.total_payouts_paise.inc(event.amountPaise);
      if (event.commissionPaise) {
        metrics.total_commission_paise.labels(event.tier || 'standard').inc(event.commissionPaise);
      }
      if (event.processingTimeSeconds) {
        metrics.escrow_release_seconds.labels('success').observe(event.processingTimeSeconds);
      }
      break;

    case 'ESCROW_REFUNDED':
      metrics.escrow_refunded_total.labels(event.reason || 'unknown').inc();
      metrics.total_refunds_paise.labels(event.reason || 'unknown').inc(event.amountPaise);
      break;

    case 'REFUND':
      metrics.refunds_processed_total.labels('full', event.status).inc();
      if (event.processingTimeSeconds) {
        metrics.refund_processing_seconds.labels(event.status === 'SUCCESS' ? 'success' : 'failure').observe(event.processingTimeSeconds);
      }
      break;

    case 'PAYOUT':
      if (event.status === 'SUCCESS') {
        metrics.payouts_initiated_total.labels('neft').inc();
        metrics.total_payouts_paise.inc(event.amountPaise);
      } else {
        metrics.payouts_failed_total.labels(event.reason || 'unknown').inc();
      }
      if (event.processingTimeSeconds) {
        metrics.payout_processing_seconds.labels(event.status === 'SUCCESS' ? 'success' : 'failure').observe(event.processingTimeSeconds);
      }
      break;

    case 'COMPENSATION':
      metrics.compensation_issued_total.labels(event.reason || 'unknown').inc();
      metrics.total_compensation_paise.labels(event.reason || 'unknown').inc(event.amountPaise);
      break;
  }
}

/**
 * Helper function to record webhook metrics
 */
export function recordWebhookEvent(
  metrics: PaymentMetrics,
  event: {
    eventType: string;
    status: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'DLQ';
    processingTimeSeconds?: number;
    reason?: string;
  }
) {
  switch (event.status) {
    case 'RECEIVED':
      metrics.webhooks_received_total.labels(event.eventType, 'razorpay').inc();
      break;
    case 'PROCESSED':
      metrics.webhooks_processed_total.labels(event.eventType).inc();
      if (event.processingTimeSeconds) {
        metrics.webhook_processing_seconds.labels(event.eventType, 'success').observe(event.processingTimeSeconds);
      }
      break;
    case 'FAILED':
      metrics.webhooks_failed_total.labels(event.eventType, event.reason || 'unknown').inc();
      if (event.processingTimeSeconds) {
        metrics.webhook_processing_seconds.labels(event.eventType, 'failure').observe(event.processingTimeSeconds);
      }
      break;
    case 'DLQ':
      metrics.webhooks_dlq_total.labels(event.eventType).inc();
      break;
  }
}
