/**
 * Payment Pipeline Workers
 *
 * BullMQ-based background job processing for:
 * - Escrow release and payout
 * - Escrow refunds
 * - Payment reconciliation
 * - Failed payout retry logic
 * - Dead-letter queue handling
 */
import crypto from 'crypto';
// Services are available via server context
// Note: TDS, Escrow, Commission services imported via app context
// ===========================
// ESCROW RELEASE WORKER
// ===========================
export async function processEscrowRelease(server, jobData) {
    const { escrow_id, order_id, farmer_id, razorpay_order_id } = jobData;
    server.log.info({ escrow_id, order_id }, 'Starting escrow release process');
    try {
        // Get escrow account
        const escrowRes = await server.db.query(`SELECT ea.* FROM vault.escrow_accounts ea WHERE ea.escrow_id = $1`, [escrow_id]);
        const escrow = escrowRes.rows[0];
        if (!escrow) {
            server.log.error({ escrow_id }, 'Escrow account not found');
            return { success: false, reason: 'Escrow not found' };
        }
        // Check escrow status
        if (escrow.escrow_status !== 'HELD') {
            server.log.warn({ escrow_id, status: escrow.escrow_status }, 'Escrow not in HELD status, skipping release');
            return { success: false, reason: `Invalid status: ${escrow.escrow_status}` };
        }
        // Get order and farmer details
        const orderRes = await server.db.query(`SELECT o.*, fp.annual_payout_inr 
       FROM public.orders o
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = o.farmer_id
       WHERE o.id = $1`, [order_id]);
        const order = orderRes.rows[0];
        if (!order) {
            server.log.error({ order_id }, 'Order not found');
            return { success: false, reason: 'Order not found' };
        }
        // Check order status
        if (order.order_status !== 'DELIVERED') {
            server.log.warn({ order_id, status: order.order_status }, 'Order not delivered, cannot release escrow');
            return { success: false, reason: `Order not delivered (${order.order_status})` };
        }
        // Calculate TDS (simplified - use default 10% for now)
        const tdsPaise = Math.floor(escrow.subtotal_paise * 0.1);
        // Update escrow status
        await server.db.query(`UPDATE vault.escrow_accounts
       SET escrow_status = 'RELEASED', release_completed_at = NOW(), updated_at = NOW()
       WHERE escrow_id = $1`, [escrow_id]);
        // Initiate payout with Razorpay
        const payoutAmount = escrow.subtotal_paise - tdsPaise; // In paise
        const payoutResult = await initiateRazorpayPayout(server, farmer_id, payoutAmount, `Escrow release for order ${order_id}`, razorpay_order_id);
        if (!payoutResult.success) {
            server.log.error({ escrow_id, farmer_id, error: payoutResult.error }, 'Payout initiation failed');
            // Create failed payout record for retry
            await createFailedPayoutRecord(server, farmer_id, order_id, payoutAmount, 'ESCROW_RELEASE', payoutResult.error || 'Unknown error');
            return { success: false, reason: payoutResult.error };
        }
        server.log.info({
            escrow_id,
            farmer_id,
            payout_id: payoutResult.payout_id,
            amount_paise: payoutAmount,
            tds_paise: tdsPaise
        }, 'Escrow released and payout initiated');
        return {
            success: true,
            escrow_id,
            payout_id: payoutResult.payout_id,
            amount_inr: payoutAmount / 100,
            tds_inr: tdsPaise / 100
        };
    }
    catch (err) {
        server.log.error({ err, escrow_id, order_id }, 'Escrow release worker failed');
        throw err; // Let BullMQ retry
    }
}
// ===========================
// ESCROW REFUND WORKER
// ===========================
export async function processEscrowRefund(server, jobData) {
    const { escrow_id, order_id, buyer_id, reason, refund_amount_paise } = jobData;
    server.log.info({ escrow_id, reason }, 'Starting escrow refund process');
    try {
        // Get escrow
        const escrowRes = await server.db.query(`SELECT ea.* FROM vault.escrow_accounts ea WHERE ea.escrow_id = $1`, [escrow_id]);
        const escrow = escrowRes.rows[0];
        if (!escrow) {
            server.log.error({ escrow_id }, 'Escrow account not found');
            return { success: false, reason: 'Escrow not found' };
        }
        // Update escrow status to REFUNDED
        await server.db.query(`UPDATE vault.escrow_accounts
       SET escrow_status = 'REFUNDED', refund_completed_at = NOW(), refund_amount_paise = $1,
           refund_reason = $2, updated_at = NOW()
       WHERE escrow_id = $3`, [refund_amount_paise || escrow.total_amount_paise, reason, escrow_id]);
        // Initiate Razorpay refund
        if (escrow.razorpay_payment_id) {
            const refundResult = await initiateRazorpayRefund(server, escrow.razorpay_payment_id, refund_amount_paise || escrow.total_amount_paise, `Refund: ${reason}`);
            if (!refundResult.success) {
                server.log.error({ escrow_id, payment_id: escrow.razorpay_payment_id }, 'Razorpay refund failed');
                return { success: false, reason: refundResult.error };
            }
            // Store refund record
            await server.db.query(`INSERT INTO vault.refunds
         (refund_id, order_id, buyer_id, refund_amount_paise, refund_reason, refund_type,
          refund_status, razorpay_refund_id, requested_at, approved_at, completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW(), NOW(), NOW())`, [
                `REFUND-${crypto.randomBytes(6).toString('hex')}`,
                order_id,
                buyer_id,
                refund_amount_paise || escrow.total_amount_paise,
                reason,
                refund_amount_paise ? 'PARTIAL' : 'FULL',
                'COMPLETED',
                refundResult.refund_id
            ]);
        }
        server.log.info({ escrow_id, refund_amount_paise: refund_amount_paise || escrow.total_amount_paise }, 'Escrow refund completed');
        return {
            success: true,
            escrow_id,
            refund_amount_inr: (refund_amount_paise || escrow.total_amount_paise) / 100
        };
    }
    catch (err) {
        server.log.error({ err, escrow_id }, 'Escrow refund worker failed');
        throw err;
    }
}
// ===========================
// PAYOUT RECONCILIATION WORKER
// ===========================
export async function processPayoutReconciliation(server, jobData = {}) {
    const reconciliationDate = jobData.reconciliation_date || new Date().toISOString().split('T')[0];
    server.log.info({ reconciliation_date: reconciliationDate }, 'Starting payout reconciliation');
    try {
        // Fetch all payouts from Razorpay for the date
        const razorpayPayouts = await fetchRazorpayPayouts(server, reconciliationDate);
        // Fetch all payouts from our database for the date
        const dbPayouts = await server.db.query(`SELECT rz_payout_id, amount_paise FROM vault.payment_ledger
       WHERE txn_type = 'ESCROW_RELEASED' AND DATE(created_at) = $1`, [reconciliationDate]);
        const dbPayoutMap = new Map(dbPayouts.rows.map(r => [r.rz_payout_id, r.amount_paise]));
        // Compare and identify discrepancies
        let discrepancies = [];
        let razorpayTotal = 0;
        let dbTotal = 0;
        for (const rzPayout of razorpayPayouts) {
            razorpayTotal += rzPayout.amount;
            if (!dbPayoutMap.has(rzPayout.id)) {
                discrepancies.push({
                    type: 'MISSING_IN_DB',
                    payout_id: rzPayout.id,
                    amount: rzPayout.amount
                });
            }
        }
        for (const [, amount] of dbPayoutMap) {
            dbTotal += amount;
        }
        // Store reconciliation record
        const reconciliationId = `RECON-${crypto.randomBytes(6).toString('hex')}`;
        const status = discrepancies.length === 0 ? 'COMPLETED' : 'VARIANCE_FOUND';
        await server.db.query(`INSERT INTO vault.payment_reconciliation
       (reconciliation_id, reconciliation_date, razorpay_transactions_count, db_transactions_count,
        razorpay_total_amount_paise, db_total_amount_paise, variance_paise, status, discrepancies,
        created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`, [
            reconciliationId,
            reconciliationDate,
            razorpayPayouts.length,
            dbPayouts.rows.length,
            razorpayTotal,
            dbTotal,
            Math.abs(razorpayTotal - dbTotal),
            status,
            JSON.stringify(discrepancies)
        ]);
        server.log.info({
            reconciliation_id: reconciliationId,
            date: reconciliationDate,
            status,
            razorpay_count: razorpayPayouts.length,
            db_count: dbPayouts.rows.length,
            variance_paise: Math.abs(razorpayTotal - dbTotal)
        }, 'Payout reconciliation completed');
        return { success: true, reconciliation_id: reconciliationId, status };
    }
    catch (err) {
        server.log.error({ err }, 'Payout reconciliation worker failed');
        throw err;
    }
}
// ===========================
// FAILED PAYOUT RETRY WORKER
// ===========================
export async function processFailedPayoutRetry(server, jobData) {
    const { failed_payout_id } = jobData;
    server.log.info({ failed_payout_id }, 'Starting failed payout retry');
    try {
        // Get failed payout record
        const fpRes = await server.db.query(`SELECT * FROM vault.failed_payouts WHERE id = $1`, [failed_payout_id]);
        const fp = fpRes.rows[0];
        if (!fp) {
            server.log.error({ failed_payout_id }, 'Failed payout record not found');
            return { success: false, reason: 'Record not found' };
        }
        if (fp.status !== 'PENDING') {
            server.log.warn({ failed_payout_id, status: fp.status }, 'Payout not pending');
            return { success: false, reason: `Status is ${fp.status}` };
        }
        // Check if max retries exceeded
        if (fp.retry_count >= fp.max_retries) {
            await server.db.query(`UPDATE vault.failed_payouts SET status = $1 WHERE id = $2`, ['MANUAL_REVIEW', failed_payout_id]);
            server.log.warn({ failed_payout_id, retry_count: fp.retry_count }, 'Max retries exceeded, marking for manual review');
            return { success: false, reason: 'Max retries exceeded' };
        }
        // Attempt payout
        const payoutResult = await initiateRazorpayPayout(server, fp.farmer_id, fp.amount_paise, fp.payout_reason, fp.payout_id);
        if (payoutResult.success) {
            // Update record
            await server.db.query(`UPDATE vault.failed_payouts 
         SET status = $1, new_razorpay_payout_id = $2, updated_at = NOW()
         WHERE id = $3`, ['SUCCEEDED', payoutResult.payout_id, failed_payout_id]);
            server.log.info({ failed_payout_id, new_payout_id: payoutResult.payout_id }, 'Failed payout retry succeeded');
            return { success: true, payout_id: payoutResult.payout_id };
        }
        else {
            // Calculate next retry time with exponential backoff
            const nextRetryMs = Math.pow(fp.backoff_multiplier, fp.retry_count + 1) * 60000; // minutes
            const nextRetryTime = new Date(Date.now() + nextRetryMs);
            // Update record with next retry time
            await server.db.query(`UPDATE vault.failed_payouts 
         SET retry_count = retry_count + 1, next_retry_at = $1, last_attempted_at = NOW(),
             last_error = $2, updated_at = NOW()
         WHERE id = $3`, [nextRetryTime.toISOString(), payoutResult.error, failed_payout_id]);
            server.log.info({ failed_payout_id, retry_count: fp.retry_count + 1, next_retry_at: nextRetryTime }, 'Failed payout retry scheduled');
            return { success: false, reason: payoutResult.error, next_retry_at: nextRetryTime };
        }
    }
    catch (err) {
        server.log.error({ err, failed_payout_id }, 'Failed payout retry worker failed');
        throw err;
    }
}
// ===========================
// DEAD-LETTER QUEUE HANDLER
// ===========================
export async function processDeadLetterQueue(server, jobData) {
    const { webhook_event_id, error, payload, timestamp } = jobData;
    server.log.error({ webhook_event_id, error, timestamp }, 'Processing webhook from dead-letter queue for manual review');
    // Log to monitoring system
    // In production, alert PagerDuty / Slack for manual investigation
    // Store for audit trail
    // For now, just log - in production would integrate with alerts
    return {
        success: false,
        note: 'Dead-letter webhook logged - requires manual investigation',
        webhook_event_id
    };
}
// ===========================
// HELPER FUNCTIONS
// ===========================
async function initiateRazorpayPayout(server, farmerId, amountPaise, narration, idempotencyKey) {
    try {
        // Get farmer bank account
        const kycRes = await server.db.query(`SELECT fund_account_id FROM vault.farmer_kyc WHERE farmer_id = $1`, [farmerId]);
        if (!kycRes.rows[0]?.fund_account_id) {
            return { success: false, error: 'Farmer bank account not configured' };
        }
        const fundAccountId = kycRes.rows[0].fund_account_id;
        // Call Razorpay Payout API
        const response = await fetch('https://api.razorpay.com/v1/payouts', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({
                fund_account_id: fundAccountId,
                amount: amountPaise,
                currency: 'INR',
                mode: 'NEFT',
                purpose: 'payout',
                narration,
                queue_if_low_balance: false
            })
        });
        if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
        }
        const data = (await response.json());
        return { success: true, payout_id: data.id };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
async function initiateRazorpayRefund(server, paymentId, amountPaise, description) {
    try {
        const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amountPaise,
                notes: { description }
            })
        });
        if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
        }
        const data = (await response.json());
        return { success: true, refund_id: data.id };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
async function fetchRazorpayPayouts(server, date) {
    try {
        const response = await fetch(`https://api.razorpay.com/v1/payouts?from=${date}&to=${date}&limit=100`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
            }
        });
        if (!response.ok)
            return [];
        const data = (await response.json());
        return (data.items || []).map((p) => ({ id: p.id, amount: p.amount }));
    }
    catch (err) {
        server.log.error({ err }, 'Failed to fetch Razorpay payouts');
        return [];
    }
}
async function createFailedPayoutRecord(server, farmerId, orderId, amountPaise, reason, error) {
    const nextRetryAt = new Date(Date.now() + 60000); // Retry in 1 minute
    await server.db.query(`INSERT INTO vault.failed_payouts
     (payout_id, farmer_id, order_id, amount_paise, payout_reason, status, next_retry_at, last_error, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`, [
        `FAILED-${crypto.randomBytes(6).toString('hex')}`,
        farmerId,
        orderId,
        amountPaise,
        reason,
        'PENDING',
        nextRetryAt.toISOString(),
        error
    ]);
}
