/**
 * Trust Score Recalculation Worker
 * BullMQ background jobs for calculating and updating farmer trust scores
 */

import { FastifyInstance } from 'fastify';
import { Job } from 'bullmq';
import {
  RecalculationStatus,
  TrustScoreCalculationRequest,
  TrustScoreMetrics,
  KYCLevel,
} from '../types/trust-score';
import { TrustScoreService } from '../services/trust-score-service';

/**
 * Aggregate metrics for a farmer from database
 */
export async function aggregateFarmerMetrics(
  db: any,
  farmerId: string,
): Promise<TrustScoreMetrics> {
  // Get completed orders and ratings
  const orderStats = await db.query(
    `SELECT
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_orders,
      COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
      AVG(CASE WHEN review_rating IS NOT NULL THEN review_rating ELSE NULL END) as avg_rating,
      COUNT(CASE WHEN review_rating IS NOT NULL THEN 1 END) as review_count,
      COUNT(CASE WHEN delivery_date IS NOT NULL AND delivery_date <= expected_delivery_date THEN 1 END)::DECIMAL / 
        NULLIF(COUNT(CASE WHEN delivery_date IS NOT NULL THEN 1 END), 0) * 100 as fulfillment_rate,
      EXTRACT(EPOCH FROM AVG(CASE WHEN response_time_seconds IS NOT NULL THEN response_time_seconds ELSE NULL END)) / 3600 as avg_response_hours
    FROM public.orders
    WHERE farmer_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 year'`,
    [farmerId],
  );

  const oStats = orderStats.rows[0];

  // Get disputes for this farmer
  const disputeStats = await db.query(
    `SELECT
      COUNT(*) as total_disputes,
      COUNT(CASE WHEN status NOT IN ('RESOLVED', 'CLOSED') THEN 1 END) as unresolved_disputes,
      COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END)::DECIMAL / 
        NULLIF(COUNT(*), 0) * 100 as resolution_rate
    FROM public.disputes
    WHERE farmer_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 year'`,
    [farmerId],
  );

  const dStats = disputeStats.rows[0];

  // Get KYC level
  const kycInfo = await db.query(
    `SELECT kyc_level, profile_completeness_percentage
    FROM vault.farmer_kyc
    WHERE farmer_id = $1`,
    [farmerId],
  );

  const kyc = kycInfo.rows[0];

  // Get last activity date
  const lastActivityQuery = await db.query(
    `SELECT MAX(GREATEST(
      (SELECT MAX(created_at) FROM public.orders WHERE farmer_id = $1),
      (SELECT MAX(created_at) FROM public.reviews WHERE farmer_id = $1),
      (SELECT MAX(created_at) FROM public.disputes WHERE farmer_id = $1)
    )) as last_activity
    FROM (SELECT 1) t`,
    [farmerId],
  );

  const lastActivity = lastActivityQuery.rows[0]?.last_activity;

  return {
    completedOrdersCount: parseInt(oStats.completed_orders) || 0,
    totalOrdersCount: parseInt(oStats.total_orders) || 0,
    averageRating: oStats.avg_rating ? parseFloat(oStats.avg_rating) : null,
    totalReviewsCount: parseInt(oStats.review_count) || 0,
    disputeCount: parseInt(dStats.total_disputes) || 0,
    disputeResolutionRate: dStats.resolution_rate ? parseFloat(dStats.resolution_rate) : 0,
    cancellationCount: parseInt(oStats.cancelled_orders) || 0,
    cancellationRate:
      oStats.total_orders > 0
        ? (parseInt(oStats.cancelled_orders) / parseInt(oStats.total_orders)) * 100
        : 0,
    fulfillmentRate: oStats.fulfillment_rate ? parseFloat(oStats.fulfillment_rate) : 0,
    averageResponseTimeHours: oStats.avg_response_hours ? parseFloat(oStats.avg_response_hours) : null,
    kycLevel: (kyc?.kyc_level || 'NONE') as KYCLevel,
    profileCompleteness: kyc?.profile_completeness_percentage
      ? parseFloat(kyc.profile_completeness_percentage)
      : 0,
    lastActivityDate: lastActivity ? new Date(lastActivity) : null,
  };
}

/**
 * Update queue status
 */
async function updateQueueStatus(
  db: any,
  queueId: number,
  status: RecalculationStatus,
  errorMessage?: string,
) {
  if (status === 'FAILED' && errorMessage) {
    // Schedule retry
    const retrySchedule = [60000, 300000, 900000]; // 1min, 5min, 15min
    const retryAttempt = await db.query(
      `SELECT attempt_count FROM vault.farmer_trust_score_recalculation_queue WHERE id = $1`,
      [queueId],
    );

    const attempt = retryAttempt.rows[0]?.attempt_count || 0;
    const nextRetryMs = retrySchedule[Math.min(attempt, retrySchedule.length - 1)];

    await db.query(
      `UPDATE vault.farmer_trust_score_recalculation_queue
      SET status = $1, attempt_count = attempt_count + 1,
          last_error_message = $2, next_retry_at = NOW() + INTERVAL '1 millisecond' * $3
      WHERE id = $4`,
      [status, errorMessage, nextRetryMs, queueId],
    );
  } else {
    await db.query(
      `UPDATE vault.farmer_trust_score_recalculation_queue
      SET status = $1, completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE NULL END,
          processing_started_at = CASE WHEN $1 = 'PROCESSING' THEN NOW() ELSE processing_started_at END
      WHERE id = $2`,
      [status, queueId],
    );
  }
}

/**
 * Process single farmer trust score recalculation
 */
export async function processTrustScoreRecalculation(
  server: FastifyInstance,
  trustScoreService: TrustScoreService,
  jobData: {
    farmerId: string;
    queueId?: number;
    reason: string;
  },
  job?: Job,
) {
  try {
    const { farmerId, queueId, reason } = jobData;
    const db = server.db;

    // Update queue status to PROCESSING
    if (queueId) {
      await updateQueueStatus(db, queueId, 'PROCESSING');
    }

    server.log.info(`[TrustScore] Starting recalculation for farmer ${farmerId}, reason: ${reason}`);

    // Aggregate metrics
    const metrics = await aggregateFarmerMetrics(db, farmerId);

    // Calculate and store trust score
    const request: TrustScoreCalculationRequest = {
      farmerId,
      metrics,
      changeReason: 'RECALCULATION',
      metadata: { triggerReason: reason },
    };

    const result = await trustScoreService.calculateAndStoreTrustScore(request);

    server.log.info(
      `[TrustScore] Recalculation completed for farmer ${farmerId}, score: ${result.trustScore.trustScoreNumeric.toFixed(2)}, category: ${result.trustScore.trustScoreCategory}`,
    );

    // Update queue status to COMPLETED
    if (queueId) {
      await updateQueueStatus(db, queueId, 'COMPLETED');
    }

    return {
      success: true,
      farmerId,
      trustScore: result.trustScore.trustScoreNumeric,
      scoreChange: result.scoreChange,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    server.log.error(`[TrustScore] Recalculation failed for farmer ${jobData.farmerId}: ${errorMsg}`);

    if (jobData.queueId) {
      await updateQueueStatus(server.db, jobData.queueId, 'FAILED', errorMsg);
    }

    throw error;
  }
}

/**
 * Process batch trust score recalculations
 */
export async function processBatchTrustScoreRecalculation(
  server: FastifyInstance,
  trustScoreService: TrustScoreService,
  jobData: {
    filters?: {
      trustScoreBelow?: number;
      trustScoreAbove?: number;
      inactiveForDays?: number;
      kycLevel?: KYCLevel;
    };
    batchSize?: number;
    priority?: number;
  },
  job?: Job,
) {
  try {
    const { filters = {}, batchSize = 100, priority = 5 } = jobData;
    const db = server.db;

    server.log.info(`[TrustScore] Starting batch recalculation with filters: ${JSON.stringify(filters)}`);

    // Build query to get farmers needing recalculation
    let query = `SELECT farmer_id FROM vault.farmer_trust_scores WHERE 1=1`;
    const params: any[] = [];

    if (filters.trustScoreBelow !== undefined) {
      query += ` AND trust_score_numeric < $${params.length + 1}`;
      params.push(filters.trustScoreBelow);
    }

    if (filters.trustScoreAbove !== undefined) {
      query += ` AND trust_score_numeric > $${params.length + 1}`;
      params.push(filters.trustScoreAbove);
    }

    if (filters.inactiveForDays !== undefined) {
      query += ` AND (NOW() - last_activity_date) > INTERVAL '1 day' * $${params.length + 1}`;
      params.push(filters.inactiveForDays);
    }

    if (filters.kycLevel) {
      query += ` AND kyc_level = $${params.length + 1}`;
      params.push(filters.kycLevel);
    }

    query += ` ORDER BY calculated_at ASC LIMIT $${params.length + 1}`;
    params.push(batchSize);

    const result = await db.query(query, params);
    const farmerIds = result.rows.map((r: any) => r.farmer_id);

    server.log.info(`[TrustScore] Found ${farmerIds.length} farmers for batch recalculation`);

    // Queue each farmer for recalculation
    const queue = server.queues.payoutQueue;
    let successCount = 0;
    let failureCount = 0;

    for (const farmerId of farmerIds) {
      try {
        // Check if already queued
        const existing = await db.query(
          `SELECT id FROM vault.farmer_trust_score_recalculation_queue WHERE farmer_id = $1 AND status = 'PENDING'`,
          [farmerId],
        );

        if (existing.rows.length === 0) {
          // Queue for recalculation
          await queue.add(
            'RECALCULATE_TRUST_SCORE',
            {
              farmerId,
              reason: 'BATCH_RECALCULATION',
            },
            {
              jobId: `trust_score_${farmerId}`,
              priority,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          );

          successCount++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        server.log.error(`[TrustScore] Failed to queue farmer ${farmerId} for batch recalculation: ${errMsg}`);
        failureCount++;
      }
    }

    server.log.info(`[TrustScore] Batch recalculation queued: ${successCount} successful, ${failureCount} failed`);

    return {
      success: true,
      totalFarmers: farmerIds.length,
      queued: successCount,
      failed: failureCount,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    server.log.error(`[TrustScore] Batch recalculation failed: ${errorMsg}`);
    throw error;
  }
}

/**
 * Process periodic (nightly) trust score recalculations
 */
export async function processPeriodicTrustScoreRecalculation(
  server: FastifyInstance,
  trustScoreService: TrustScoreService,
  jobData?: any,
  job?: Job,
) {
  try {
    server.log.info(`[TrustScore] Starting periodic recalculation job`);

    // Run night time calculations:
    // 1. Farmers with inactivity > 6 months (time decay applies)
    // 2. Farmers with significant metric changes
    // 3. Sample of active farmers (10% for freshness)

    const db = server.db;

    // Get farmers for recalculation
    const farmers = await db.query(`
      SELECT farmer_id FROM vault.farmer_trust_scores
      WHERE
        (days_since_activity > 180)  -- Inactive > 6 months
        OR (calculated_at < NOW() - INTERVAL '7 days')  -- Not updated in 7 days
      ORDER BY calculated_at ASC
      LIMIT 1000
    `);

    const queue = server.queues.payoutQueue;
    let queued = 0;

    for (const row of farmers.rows) {
      try {
        await queue.add(
          'RECALCULATE_TRUST_SCORE',
          {
            farmerId: row.farmer_id,
            reason: 'PERIODIC_RECALCULATION',
          },
          {
            jobId: `trust_score_periodic_${row.farmer_id}`,
            priority: 3,
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            delay: Math.random() * 60000, // Spread jobs over 1 minute
          },
        );
        queued++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        server.log.error(`Failed to queue farmer ${row.farmer_id}: ${errMsg}`);
      }
    }

    server.log.info(`[TrustScore] Periodic recalculation: queued ${queued} farmers`);

    return {
      success: true,
      farmerCount: farmers.rows.length,
      queued,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    server.log.error(`[TrustScore] Periodic recalculation failed: ${errorMsg}`);
    throw error;
  }
}

/**
 * Queue a farmer for trust score recalculation
 */
export async function queueTrustScoreRecalculation(
  server: FastifyInstance,
  farmerId: string,
  reason: string,
  priority: number = 5,
) {
  const db = server.db;
  const queue = server.queues.payoutQueue;

  try {
    // Queue in database for tracking
    const result = await db.query(
      `INSERT INTO vault.farmer_trust_score_recalculation_queue (
        farmer_id, trigger_reason, priority, status
      ) VALUES ($1, $2, $3, 'PENDING')
      ON CONFLICT (farmer_id) DO UPDATE SET
        trigger_reason = CONCAT(EXCLUDED.trigger_reason, ' + ', $2),
        priority = GREATEST(EXCLUDED.priority, $3),
        status = 'PENDING',
        updated_at = NOW()
      RETURNING id`,
      [farmerId, reason, priority],
    );

    const queueId = result.rows[0]?.id;

    // Queue in BullMQ
    await queue.add(
      'RECALCULATE_TRUST_SCORE',
      {
        farmerId,
        queueId,
        reason,
      },
      {
        jobId: `trust_score_${farmerId}`,
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    server.log.info(`[TrustScore] Queued farmer ${farmerId} for recalculation (reason: ${reason})`);

    return { success: true, queueId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    server.log.error(`[TrustScore] Failed to queue recalculation for farmer ${farmerId}: ${errMsg}`);
    throw error;
  }
}
