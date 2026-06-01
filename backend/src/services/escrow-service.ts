/**
 * Escrow Lifecycle Service
 * 
 * Manages escrow state transitions with strict validation:
 * - PENDING → HELD (payment confirmed)
 * - HELD → RELEASED (delivery confirmed)
 * - HELD → REFUNDED (buyer requests refund)
 * - HELD → DISPUTED (dispute filed)
 * - DISPUTED → RELEASED/REFUNDED (dispute resolved)
 * 
 * Ensures:
 * - State machine validation
 * - Optimistic locking for concurrent updates
 * - Transaction integrity with ledger entries
 * - Compensation handling
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import {
  EscrowAccount,
  EscrowStatus,
  EscrowLifecycleEvent
} from '../types/payments.js';
import { SettlementEngine } from './commission-settlement-service.js';

export function createEscrowService(
  server: FastifyInstance,
  settlementEngine: SettlementEngine
) {
  // Valid state transitions
  const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
    PENDING: ['HELD', 'CANCELLED'],
    HELD: ['RELEASED', 'REFUNDED', 'DISPUTED', 'CANCELLED'],
    RELEASED: [],                      // Terminal state
    REFUNDED: [],                      // Terminal state
    CANCELLED: [],                     // Terminal state
    DISPUTED: ['RELEASED', 'REFUNDED'] // Can only resolve to these
  };

  /**
   * Get escrow account with locking
   */
  async function getEscrowAccount(escrowId: string): Promise<EscrowAccount> {
    const result = await server.db.query(
      `SELECT * FROM vault.escrow_accounts WHERE escrow_id = $1 FOR UPDATE`,
      [escrowId]
    );

    if (!result.rows[0]) {
      throw server.httpErrors.notFound('Escrow account not found');
    }

    return result.rows[0];
  }

  /**
   * Validate state transition
   */
  function validateTransition(
    fromStatus: EscrowStatus,
    toStatus: EscrowStatus
  ): boolean {
    const validNext = VALID_TRANSITIONS[fromStatus] || [];
    return validNext.includes(toStatus);
  }

  /**
   * Create new escrow for order
   * Called after payment is confirmed
   */
  async function createEscrow(
    orderId: string,
    farmerId: string,
    buyerId: string,
    subtotalPaise: number,
    commissionPaise: number,
    commissionPercentage: number,
    isPremium: boolean,
    razorpayOrderId: string,
    razorpayPaymentId: string
  ): Promise<EscrowAccount> {
    const escrowId = `ESC-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const totalPaise = subtotalPaise + commissionPaise;

    await server.db.query('BEGIN');
    try {
      // Create escrow account
      const escrowResult = await server.db.query(
        `INSERT INTO vault.escrow_accounts
         (escrow_id, order_id, farmer_id, buyer_id, escrow_status,
          total_amount_paise, subtotal_paise, commission_paise, commission_percentage,
          is_premium, razorpay_order_id, razorpay_payment_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING *`,
        [
          escrowId,
          orderId,
          farmerId,
          buyerId,
          'PENDING',
          totalPaise,
          subtotalPaise,
          commissionPaise,
          commissionPercentage,
          isPremium,
          razorpayOrderId,
          razorpayPaymentId
        ]
      );

      const escrow = escrowResult.rows[0];

      // Create ledger entry
      await settlementEngine.createLedgerEntry(
        `TXN-${crypto.randomBytes(6).toString('hex')}`,
        orderId,
        escrowId,
        farmerId,
        buyerId,
        'ESCROW_HELD',
        totalPaise,
        commissionPaise,
        0, // TDS applied during release
        { razorpay_payment_id: razorpayPaymentId }
      );

      // Log event
      await logEscrowEvent(
        escrowId,
        'PENDING',
        'HELD',
        'PAYMENT_CAPTURED',
        { razorpay_payment_id: razorpayPaymentId }
      );

      await server.db.query('COMMIT');

      server.log.info(
        { escrow_id: escrowId, order_id: orderId, total_paise: totalPaise },
        'Escrow account created'
      );

      return escrow;
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Release escrow to farmer (after delivery confirmation)
   * Applies TDS and initiates payout
   */
  async function releaseEscrow(
    escrowId: string,
    tdsDeductedPaise: number = 0
  ): Promise<EscrowAccount> {
    await server.db.query('BEGIN');
    try {
      const escrow = await getEscrowAccount(escrowId);

      // Validate state transition
      if (!validateTransition(escrow.escrow_status, 'RELEASED')) {
        throw server.httpErrors.badRequest(
          `Cannot release escrow with status ${escrow.escrow_status}`
        );
      }

      // Calculate payout
      const farmerPayoutPaise = escrow.subtotal_paise - tdsDeductedPaise;

      // Update escrow
      const updateResult = await server.db.query(
        `UPDATE vault.escrow_accounts
         SET escrow_status = $1, release_approved_at = NOW(), release_completed_at = NOW(),
             version = version + 1, updated_at = NOW()
         WHERE escrow_id = $2 AND version = $3
         RETURNING *`,
        ['RELEASED', escrowId, escrow.version]
      );

      if (updateResult.rowCount === 0) {
        throw server.httpErrors.conflict(
          'Escrow version mismatch - concurrent update detected'
        );
      }

      const updatedEscrow = updateResult.rows[0];

      // Create ledger entry for release
      await settlementEngine.createLedgerEntry(
        `TXN-${crypto.randomBytes(6).toString('hex')}`,
        escrow.order_id,
        escrowId,
        escrow.farmer_id,
        escrow.buyer_id,
        'ESCROW_RELEASED',
        escrow.subtotal_paise,
        escrow.commission_paise,
        tdsDeductedPaise,
        { escrow_id: escrowId }
      );

      // Log event
      await logEscrowEvent(
        escrowId,
        'HELD',
        'RELEASED',
        'DELIVERY_CONFIRMED',
        { tds_deducted_paise: tdsDeductedPaise, farmer_payout: farmerPayoutPaise }
      );

      await server.db.query('COMMIT');

      server.log.info(
        {
          escrow_id: escrowId,
          farmer_payout_paise: farmerPayoutPaise,
          tds_paise: tdsDeductedPaise
        },
        'Escrow released to farmer'
      );

      return updatedEscrow;
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Refund escrow to buyer
   * Called when buyer requests cancellation or disputes resolution
   */
  async function refundEscrow(
    escrowId: string,
    reason: string,
    refundAmountPaise?: number
  ): Promise<EscrowAccount> {
    await server.db.query('BEGIN');
    try {
      const escrow = await getEscrowAccount(escrowId);

      // Validate state transition
      if (!validateTransition(escrow.escrow_status, 'REFUNDED')) {
        throw server.httpErrors.badRequest(
          `Cannot refund escrow with status ${escrow.escrow_status}`
        );
      }

      // Use full amount or specified partial refund
      const actualRefundPaise = refundAmountPaise ?? escrow.total_amount_paise;

      if (actualRefundPaise > escrow.total_amount_paise) {
        throw server.httpErrors.badRequest(
          'Refund amount cannot exceed escrow total'
        );
      }

      // Update escrow
      const updateResult = await server.db.query(
        `UPDATE vault.escrow_accounts
         SET escrow_status = $1, refund_requested_at = NOW(), refund_reason = $2,
             refund_completed_at = NOW(), refund_amount_paise = $3,
             version = version + 1, updated_at = NOW()
         WHERE escrow_id = $4 AND version = $5
         RETURNING *`,
        ['REFUNDED', reason, actualRefundPaise, escrowId, escrow.version]
      );

      if (updateResult.rowCount === 0) {
        throw server.httpErrors.conflict('Escrow version mismatch');
      }

      const updatedEscrow = updateResult.rows[0];

      // Create ledger entry for refund
      await settlementEngine.createLedgerEntry(
        `TXN-${crypto.randomBytes(6).toString('hex')}`,
        escrow.order_id,
        escrowId,
        escrow.farmer_id,
        escrow.buyer_id,
        'REFUND_COMPLETED',
        actualRefundPaise,
        0,
        0,
        { reason, escrow_id: escrowId }
      );

      // Log event
      await logEscrowEvent(
        escrowId,
        escrow.escrow_status,
        'REFUNDED',
        'REFUND_REQUESTED',
        { refund_amount: actualRefundPaise, reason }
      );

      await server.db.query('COMMIT');

      server.log.info(
        { escrow_id: escrowId, refund_paise: actualRefundPaise, reason },
        'Escrow refunded to buyer'
      );

      return updatedEscrow;
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Issue compensation for failed delivery or dispute resolution
   * Adds to buyer's account or seller's liability
   */
  async function issueCompensation(
    escrowId: string,
    compensationAmountPaise: number,
    reason: string
  ): Promise<EscrowAccount> {
    await server.db.query('BEGIN');
    try {
      const escrow = await getEscrowAccount(escrowId);

      // Update escrow with compensation
      const updateResult = await server.db.query(
        `UPDATE vault.escrow_accounts
         SET compensation_amount_paise = $1, compensation_reason = $2,
             compensation_approved_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE escrow_id = $3 AND version = $4
         RETURNING *`,
        [compensationAmountPaise, reason, escrowId, escrow.version]
      );

      if (updateResult.rowCount === 0) {
        throw server.httpErrors.conflict('Escrow version mismatch');
      }

      const updatedEscrow = updateResult.rows[0];

      // Create ledger entry for compensation
      await settlementEngine.createLedgerEntry(
        `TXN-${crypto.randomBytes(6).toString('hex')}`,
        escrow.order_id,
        escrowId,
        escrow.farmer_id,
        escrow.buyer_id,
        'COMPENSATION',
        compensationAmountPaise,
        0,
        0,
        { reason, escrow_id: escrowId }
      );

      // Log event
      await logEscrowEvent(
        escrowId,
        escrow.escrow_status,
        escrow.escrow_status, // Status doesn't change, but event is recorded
        'COMPENSATION_ISSUED',
        { compensation_amount: compensationAmountPaise, reason }
      );

      await server.db.query('COMMIT');

      server.log.info(
        { escrow_id: escrowId, compensation_paise: compensationAmountPaise, reason },
        'Compensation issued'
      );

      return updatedEscrow;
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Log escrow lifecycle event
   * Creates audit trail for compliance
   */
  async function logEscrowEvent(
    escrowId: string,
    fromStatus: EscrowStatus,
    toStatus: EscrowStatus,
    eventType: string,
    metadata: Record<string, unknown>
  ): Promise<EscrowLifecycleEvent> {
    // Log will be primarily in database, but also to structured logs
    server.log.info(
      {
        escrow_id: escrowId,
        from_status: fromStatus,
        to_status: toStatus,
        event_type: eventType,
        metadata
      },
      'Escrow lifecycle event'
    );

    return {
      escrow_id: escrowId,
      from_status: fromStatus,
      to_status: toStatus,
      event_type: eventType as any,
      timestamp: new Date().toISOString(),
      metadata
    };
  }

  /**
   * Get escrow status for display
   */
  async function getEscrowStatus(escrowId: string): Promise<{
    escrow_id: string;
    status: EscrowStatus;
    total_amount_inr: number;
    commission_percentage: number;
    is_premium: boolean;
    created_at: string;
    release_completed_at: string | null;
    refund_completed_at: string | null;
  }> {
    const escrow = await getEscrowAccount(escrowId);

    return {
      escrow_id: escrow.escrow_id,
      status: escrow.escrow_status,
      total_amount_inr: escrow.total_amount_paise / 100,
      commission_percentage: escrow.commission_percentage,
      is_premium: escrow.is_premium,
      created_at: escrow.created_at,
      release_completed_at: escrow.release_completed_at || null,
      refund_completed_at: escrow.refund_completed_at || null
    };
  }

  return {
    getEscrowAccount,
    validateTransition,
    createEscrow,
    releaseEscrow,
    refundEscrow,
    issueCompensation,
    logEscrowEvent,
    getEscrowStatus,
    VALID_TRANSITIONS
  };
}

export type EscrowService = ReturnType<typeof createEscrowService>;
