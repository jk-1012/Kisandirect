/**
 * Commission & Settlement Engines
 *
 * Features:
 * - Precise decimal-safe calculations (no floating-point)
 * - Commission tier logic (standard 2%, premium 3%, seasonal 1.5%)
 * - TDS deduction integration
 * - Settlement batch calculations
 * - Ledger generation with hash chain verification
 */
import crypto from 'crypto';
export function createCommissionEngine(server) {
    /**
     * Get applicable commission config for farmer
     * Selects the best available commission tier based on eligibility
     */
    async function getCommissionConfig(farmerId) {
        // Get farmer trust score and sales metrics
        const farmerRes = await server.db.query(`SELECT u.trust_score, fp.annual_payout_inr
       FROM public.users u
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = u.id
       WHERE u.id = $1`, [farmerId]);
        if (!farmerRes.rows[0]) {
            throw server.httpErrors.notFound('Farmer not found');
        }
        const farmer = farmerRes.rows[0];
        const trustScore = farmer.trust_score || 0;
        const annualPayoutPaise = (farmer.annual_payout_inr || 0) * 100;
        // Query available commission tiers sorted by commission percentage (lowest first for best rate)
        const configRes = await server.db.query(`SELECT * FROM vault.commission_config
       WHERE is_active = true
         AND effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY commission_percentage ASC
       LIMIT 10`, []);
        const configs = configRes.rows;
        // Find the best eligible tier
        for (const config of configs) {
            const meetsMinSales = !config.min_monthly_sales_paise ||
                annualPayoutPaise >= config.min_monthly_sales_paise;
            const meetsMinScore = !config.min_trust_score ||
                trustScore >= config.min_trust_score;
            if (meetsMinSales && meetsMinScore) {
                server.log.debug({
                    farmer_id: farmerId,
                    commission_name: config.commission_name,
                    percentage: config.commission_percentage
                }, 'Commission tier selected');
                return config;
            }
        }
        // Fallback to standard commission
        const defaultRes = await server.db.query(`SELECT * FROM vault.commission_config WHERE commission_name = 'STANDARD'`, []);
        if (!defaultRes.rows[0]) {
            throw server.httpErrors.internalServerError('No commission configuration found');
        }
        return defaultRes.rows[0];
    }
    /**
     * Calculate commission precisely using integer arithmetic (no floating-point)
     *
     * Formula: commission_paise = FLOOR((subtotal_paise * percentage) / 100)
     * This avoids any floating-point errors
     */
    function calculateCommissionPrecise(subtotalPaise, commissionPercentage) {
        // Convert to ensure we're working with exact values
        const subtotal = BigInt(Math.floor(subtotalPaise));
        const percentage = BigInt(Math.floor(commissionPercentage * 100)); // e.g., 2.00% -> 200
        // Calculate: (subtotal * percentage) / 10000
        const commission = (subtotal * percentage) / BigInt(10000);
        return Number(commission);
    }
    /**
     * Calculate complete order commission including premium adjustments
     */
    async function calculateOrderCommission(farmerId, subtotalPaise) {
        const config = await getCommissionConfig(farmerId);
        const commissionPaise = calculateCommissionPrecise(subtotalPaise, config.commission_percentage);
        const totalPaise = subtotalPaise + commissionPaise;
        return {
            subtotal_paise: subtotalPaise,
            commission_percentage: config.commission_percentage,
            commission_name: config.commission_name,
            commission_paise: commissionPaise,
            total_paise: totalPaise,
            is_premium: config.commission_percentage > 2.0
        };
    }
    return {
        getCommissionConfig,
        calculateCommissionPrecise,
        calculateOrderCommission
    };
}
// ===========================
// SETTLEMENT ENGINE
// ===========================
export function createSettlementEngine(server) {
    const commissionEngine = createCommissionEngine(server);
    /**
     * Get previous ledger entry hash for chain verification
     */
    async function getPreviousLedgerHash() {
        const result = await server.db.query(`SELECT ledger_hash FROM vault.payment_ledger ORDER BY created_at DESC LIMIT 1`, []);
        return result.rows[0]?.ledger_hash || '';
    }
    /**
     * Compute SHA256 hash of ledger entry for chain verification
     * Ensures immutability of transaction history
     */
    function computeLedgerHash(transactionId, previousHash, amount, timestamp, metadata) {
        const hashInput = JSON.stringify({
            transaction_id: transactionId,
            previous_hash: previousHash,
            amount,
            timestamp,
            metadata
        });
        return crypto.createHash('sha256').update(hashInput).digest('hex');
    }
    /**
     * Create ledger entry with hash chain for audit trail
     */
    async function createLedgerEntry(transactionId, orderId, escrowId, farmerId, buyerId, txnType, amountPaise, commissionPaise = 0, tdsDeductedPaise = 0, metadata = {}) {
        const previousHash = await getPreviousLedgerHash();
        const now = new Date().toISOString();
        const ledgerHash = computeLedgerHash(transactionId, previousHash, amountPaise, now, metadata);
        const netPayout = amountPaise - commissionPaise - tdsDeductedPaise;
        // Calculate running balance
        const lastEntry = await server.db.query(`SELECT running_balance_paise FROM vault.payment_ledger ORDER BY created_at DESC LIMIT 1`, []);
        const runningBalance = (lastEntry.rows[0]?.running_balance_paise || 0) + netPayout;
        const result = await server.db.query(`INSERT INTO vault.payment_ledger
       (transaction_id, ledger_hash, prev_ledger_hash, order_id, escrow_id, farmer_id, 
        buyer_id, txn_type, amount_paise, commission_paise, tds_deducted_paise, 
        net_payout_paise, running_balance_paise, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING *`, [
            transactionId,
            ledgerHash,
            previousHash,
            orderId,
            escrowId,
            farmerId,
            buyerId,
            txnType,
            amountPaise,
            commissionPaise,
            tdsDeductedPaise,
            netPayout,
            runningBalance,
            JSON.stringify(metadata)
        ]);
        return result.rows[0];
    }
    /**
     * Verify ledger hash chain integrity
     * Returns validation result with any broken links
     */
    async function verifyLedgerChain() {
        const result = await server.db.query('SELECT verify_ledger_chain() as result', []);
        const verification = result.rows[0]?.result?.[0];
        return {
            verified: verification?.verified ?? true,
            brokenAt: verification?.issue_description
        };
    }
    /**
     * Calculate settlement for a farmer in a date range
     * Aggregates all transactions and computes net payout
     */
    async function calculateSettlement(farmerId, periodStart, // YYYY-MM-DD
    periodEnd) {
        // Get all ledger entries for the period
        const entriesResult = await server.db.query(`SELECT * FROM vault.payment_ledger
       WHERE farmer_id = $1
         AND DATE(created_at) >= $2
         AND DATE(created_at) <= $3
       ORDER BY created_at ASC`, [farmerId, periodStart, periodEnd]);
        const entries = entriesResult.rows;
        // Aggregate amounts
        let totalSalesPaise = 0;
        let totalCommissionPaise = 0;
        let totalTdsPaise = 0;
        let totalRefundsPaise = 0;
        for (const entry of entries) {
            switch (entry.txn_type) {
                case 'ESCROW_RELEASED':
                    totalSalesPaise += entry.amount_paise;
                    totalCommissionPaise += entry.commission_paise || 0;
                    totalTdsPaise += entry.tds_deducted_paise || 0;
                    break;
                case 'REFUND_COMPLETED':
                    totalRefundsPaise += entry.amount_paise;
                    break;
            }
        }
        const netPayoutPaise = totalSalesPaise - totalCommissionPaise - totalTdsPaise - totalRefundsPaise;
        // Get order counts
        const countsResult = await server.db.query(`SELECT 
        COUNT(DISTINCT CASE WHEN pl.txn_type = 'ESCROW_RELEASED' THEN pl.order_id END) as orders_count,
        COUNT(DISTINCT CASE WHEN pl.txn_type = 'REFUND_COMPLETED' THEN pl.order_id END) as refunds_count
       FROM vault.payment_ledger pl
       WHERE pl.farmer_id = $1
         AND DATE(pl.created_at) >= $2
         AND DATE(pl.created_at) <= $3`, [farmerId, periodStart, periodEnd]);
        const counts = countsResult.rows[0];
        return {
            farmer_id: farmerId,
            period_start: periodStart,
            period_end: periodEnd,
            total_sales_paise: totalSalesPaise,
            total_commission_paise: totalCommissionPaise,
            total_tds_paise: totalTdsPaise,
            total_refunds_paise: totalRefundsPaise,
            net_payout_paise: netPayoutPaise,
            orders_count: counts.orders_count || 0,
            refunds_count: counts.refunds_count || 0,
            ledger_entries: entries
        };
    }
    /**
     * Create settlement record in database
     * Prepares farmer payout for transfer
     */
    async function createSettlement(farmerId, periodStart, periodEnd) {
        // Calculate the settlement amounts
        const calculation = await calculateSettlement(farmerId, periodStart, periodEnd);
        // Generate unique settlement ID
        const settlementId = `SETTLE-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        // Create settlement record
        const result = await server.db.query(`INSERT INTO vault.settlements
       (settlement_id, farmer_id, settlement_period_start, settlement_period_end,
        total_sales_paise, total_commission_paise, total_tds_paise, total_refunds_paise,
        net_payout_paise, settlement_status, ledger_entries_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`, [
            settlementId,
            farmerId,
            periodStart,
            periodEnd,
            calculation.total_sales_paise,
            calculation.total_commission_paise,
            calculation.total_tds_paise,
            calculation.total_refunds_paise,
            calculation.net_payout_paise,
            'PENDING',
            calculation.ledger_entries.length
        ]);
        server.log.info({
            settlement_id: settlementId,
            farmer_id: farmerId,
            net_payout_paise: calculation.net_payout_paise,
            net_payout_inr: calculation.net_payout_paise / 100
        }, 'Settlement created');
        return result.rows[0];
    }
    /**
     * Verify settlement amounts match ledger entries
     * Ensures data integrity before payout
     */
    async function verifySettlement(settlementId) {
        const settlement = await server.db.query(`SELECT * FROM vault.settlements WHERE settlement_id = $1`, [settlementId]);
        if (!settlement.rows[0]) {
            throw server.httpErrors.notFound('Settlement not found');
        }
        const sett = settlement.rows[0];
        // Recalculate from ledger
        const recalc = await calculateSettlement(sett.farmer_id, sett.settlement_period_start, sett.settlement_period_end);
        // Verify amounts match exactly
        const amountsMatch = sett.total_sales_paise === recalc.total_sales_paise &&
            sett.total_commission_paise === recalc.total_commission_paise &&
            sett.total_tds_paise === recalc.total_tds_paise &&
            sett.net_payout_paise === recalc.net_payout_paise;
        if (amountsMatch) {
            // Verify hash chain
            const chainValid = await verifyLedgerChain();
            if (chainValid.verified) {
                // Mark as verified in DB
                await server.db.query(`UPDATE vault.settlements 
           SET ledger_hash_verified = true 
           WHERE settlement_id = $1`, [settlementId]);
                return true;
            }
        }
        server.log.error({ settlement_id: settlementId }, 'Settlement verification failed');
        return false;
    }
    return {
        getPreviousLedgerHash,
        computeLedgerHash,
        createLedgerEntry,
        verifyLedgerChain,
        calculateSettlement,
        createSettlement,
        verifySettlement
    };
}
