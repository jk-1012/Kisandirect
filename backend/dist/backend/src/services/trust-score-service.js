/**
 * Trust Score Service
 * Implements the complete trust scoring algorithm with caching and history tracking
 */
const CACHE_CONFIG = {
    ttlSeconds: 3600, // 1 hour
    invalidateOn: [
        'COMPLETED_ORDER',
        'NEW_REVIEW',
        'DISPUTE_CREATED',
        'DISPUTE_RESOLVED',
        'ORDER_CANCELLED',
        'KYC_IMPROVEMENT',
        'PROFILE_UPDATE',
        'FRAUD_DETECTED',
    ],
    compressionEnabled: false,
};
const CACHE_KEY_PREFIX = 'trust_score:';
const PERCENTILE_CACHE_KEY = 'trust_score:percentiles';
/**
 * Create trust score service
 */
export function createTrustScoreService(server) {
    const redis = server.redis;
    const db = server.db;
    /**
     * Load scoring configuration from database
     */
    async function loadScoringConfig() {
        const params = await db.query(`SELECT parameter_name, value_numeric, value_json FROM vault.trust_score_parameters WHERE is_active AND effective_date <= CURRENT_DATE`);
        const paramMap = new Map(params.rows.map((p) => [p.parameter_name, p.value_numeric || p.value_json]));
        return {
            weights: {
                completedOrders: paramMap.get('WEIGHT_COMPLETED_ORDERS') || 25,
                averageRating: paramMap.get('WEIGHT_AVERAGE_RATING') || 25,
                fulfillmentRate: paramMap.get('WEIGHT_FULFILLMENT_RATE') || 20,
                responseTime: paramMap.get('WEIGHT_RESPONSE_TIME') || 10,
                profileCompleteness: paramMap.get('WEIGHT_PROFILE_COMPLETENESS') || 10,
                kycVerification: paramMap.get('WEIGHT_KYC_VERIFICATION') || 15,
            },
            bonuses: {
                kycBasic: paramMap.get('KYC_BONUS_BASIC') || 5,
                kycVerified: paramMap.get('KYC_BONUS_VERIFIED') || 10,
                kycAdvanced: paramMap.get('KYC_BONUS_ADVANCED') || 15,
                profileCompletenessMax: paramMap.get('PROFILE_COMPLETENESS_BONUS_MAX') || 5,
                deliverySuccessBonus: paramMap.get('DELIVERY_SUCCESS_BONUS_RATE') || 10,
                responseTimeThresholdHours: paramMap.get('RESPONSE_TIME_BONUS_HOURS') || 24,
                responseTimeBonusPoints: paramMap.get('RESPONSE_TIME_BONUS_POINTS') || 5,
            },
            penalties: {
                disputePerUnresolved: paramMap.get('DISPUTE_PENALTY_PER_UNRESOLVED') || 10,
                disputeMaxPenalty: paramMap.get('DISPUTE_PENALTY_MAX') || 30,
                cancellationPerCancellation: paramMap.get('CANCELLATION_PENALTY_PER_CANCELLATION') || 5,
                cancellationMaxPenalty: paramMap.get('CANCELLATION_PENALTY_MAX') || 20,
                fraudSeverePenalty: paramMap.get('FRAUD_PENALTY_SEVERE') || 25,
            },
            decay: {
                ratePerMonth: paramMap.get('TIME_DECAY_RATE_PER_MONTH') || 0.5,
                maxPenalty: paramMap.get('TIME_DECAY_MAX_PENALTY') || 10,
                startMonths: paramMap.get('TIME_DECAY_START_MONTHS') || 6,
            },
            thresholds: {
                minOrdersForRating: paramMap.get('MIN_ORDERS_FOR_RATING') || 5,
                excellentThreshold: paramMap.get('EXCELLENT_THRESHOLD') || 85,
                goodThreshold: paramMap.get('GOOD_THRESHOLD') || 70,
                averageThreshold: paramMap.get('AVERAGE_THRESHOLD') || 50,
                belowAverageThreshold: paramMap.get('BELOW_AVERAGE_THRESHOLD') || 30,
            },
            baseScore: 50,
        };
    }
    /**
     * Calculate trust score from metrics
     */
    function calculateTrustScore(metrics, config) {
        const breakdown = {
            farmerId: '', // Will be set later
            baseScore: config.baseScore,
            components: [],
            bonuses: {
                kycBonus: 0,
                completionBonus: 0,
                deliverySuccessBonus: 0,
                responseSpeedBonus: 0,
                totalBonuses: 0,
            },
            penalties: {
                disputePenalty: 0,
                cancellationPenalty: 0,
                fraudPenalty: 0,
                timDecayPenalty: 0,
                totalPenalties: 0,
            },
            finalScore: config.baseScore,
            category: 'AVERAGE',
            calculations: {
                completionRate: 0,
                fulfillmentRate: 0,
                avgResponse: metrics.averageResponseTimeHours,
                kycLevel: metrics.kycLevel,
                monthsInactive: 0,
            },
        };
        let score = config.baseScore;
        // ============ COMPLETION RATE ============
        const completionRate = metrics.totalOrdersCount > 0 ? (metrics.completedOrdersCount / metrics.totalOrdersCount) * 100 : 0;
        breakdown.calculations.completionRate = completionRate;
        const completionPoints = (completionRate / 100) * (config.weights.completedOrders / 10);
        breakdown.components.push({
            name: 'BASE_SCORE',
            weight: config.weights.completedOrders,
            basePoints: completionPoints,
            adjustmentPoints: 0,
            finalPoints: completionPoints,
            explanation: `Completion rate: ${completionRate.toFixed(1)}% (${metrics.completedOrdersCount}/${metrics.totalOrdersCount} orders)`,
        });
        score += completionPoints;
        // ============ AVERAGE RATING ============
        let ratingPoints = 0;
        if (metrics.totalReviewsCount >= config.thresholds.minOrdersForRating && metrics.averageRating !== null) {
            // Scale: 5.0 rating = full points, 0 rating = 0 points
            ratingPoints = ((metrics.averageRating / 5) * config.weights.averageRating) / 10;
        }
        breakdown.components.push({
            name: 'BASE_SCORE',
            weight: config.weights.averageRating,
            basePoints: ratingPoints,
            adjustmentPoints: 0,
            finalPoints: ratingPoints,
            explanation: metrics.averageRating !== null
                ? `Average rating: ${metrics.averageRating.toFixed(2)}/5.0 from ${metrics.totalReviewsCount} reviews`
                : `No reviews yet (need ${config.thresholds.minOrdersForRating} completed orders)`,
        });
        score += ratingPoints;
        // ============ FULFILLMENT RATE ============
        breakdown.calculations.fulfillmentRate = metrics.fulfillmentRate;
        const fulfillmentPoints = (Math.max(0, metrics.fulfillmentRate - 80) / 100) * (config.weights.fulfillmentRate / 10);
        breakdown.components.push({
            name: 'BASE_SCORE',
            weight: config.weights.fulfillmentRate,
            basePoints: fulfillmentPoints,
            adjustmentPoints: 0,
            finalPoints: fulfillmentPoints,
            explanation: `Fulfillment rate: ${metrics.fulfillmentRate.toFixed(1)}% (on-time deliveries)`,
        });
        score += fulfillmentPoints;
        // ============ KYC BONUS ============
        let kycBonus = 0;
        switch (metrics.kycLevel) {
            case 'ADVANCED':
                kycBonus = config.bonuses.kycAdvanced;
                break;
            case 'VERIFIED':
                kycBonus = config.bonuses.kycVerified;
                break;
            case 'BASIC':
                kycBonus = config.bonuses.kycBasic;
                break;
            case 'NONE':
                kycBonus = 0;
                break;
        }
        breakdown.bonuses.kycBonus = kycBonus;
        breakdown.components.push({
            name: 'KYC_BONUS',
            weight: config.weights.kycVerification,
            basePoints: kycBonus,
            adjustmentPoints: 0,
            finalPoints: kycBonus,
            explanation: `KYC Level: ${metrics.kycLevel} (+${kycBonus} points)`,
        });
        score += kycBonus;
        // ============ PROFILE COMPLETENESS BONUS ============
        let completionBonus = 0;
        if (metrics.profileCompleteness !== null && metrics.profileCompleteness > 0) {
            completionBonus = (metrics.profileCompleteness / 100) * config.bonuses.profileCompletenessMax;
        }
        breakdown.bonuses.completionBonus = completionBonus;
        breakdown.components.push({
            name: 'PROFILE_COMPLETENESS_BONUS',
            weight: config.weights.profileCompleteness,
            basePoints: completionBonus,
            adjustmentPoints: 0,
            finalPoints: completionBonus,
            explanation: `Profile completeness: ${metrics.profileCompleteness?.toFixed(1) || 0}% (+${completionBonus.toFixed(2)} points)`,
        });
        score += completionBonus;
        // ============ DELIVERY SUCCESS BONUS ============
        let deliveryBonus = 0;
        if (metrics.fulfillmentRate > 90) {
            const excessRate = metrics.fulfillmentRate - 90;
            deliveryBonus = Math.min((excessRate / 10) * config.bonuses.deliverySuccessBonus, config.bonuses.deliverySuccessBonus);
        }
        breakdown.bonuses.deliverySuccessBonus = deliveryBonus;
        breakdown.components.push({
            name: 'DELIVERY_SUCCESS_BONUS',
            weight: 0,
            basePoints: deliveryBonus,
            adjustmentPoints: 0,
            finalPoints: deliveryBonus,
            explanation: `High fulfillment rate bonus: +${deliveryBonus.toFixed(2)} points (fulfillment > 90%)`,
        });
        score += deliveryBonus;
        // ============ RESPONSE SPEED BONUS ============
        let responseBonus = 0;
        if (metrics.averageResponseTimeHours !== null && metrics.averageResponseTimeHours <= config.bonuses.responseTimeThresholdHours) {
            responseBonus = config.bonuses.responseTimeBonusPoints;
        }
        breakdown.bonuses.responseSpeedBonus = responseBonus;
        breakdown.components.push({
            name: 'RESPONSE_SPEED_BONUS',
            weight: config.weights.responseTime,
            basePoints: responseBonus,
            adjustmentPoints: 0,
            finalPoints: responseBonus,
            explanation: `Fast response time: ${metrics.averageResponseTimeHours?.toFixed(1) || 'N/A'}h (threshold: ${config.bonuses.responseTimeThresholdHours}h) +${responseBonus} points`,
        });
        score += responseBonus;
        breakdown.bonuses.totalBonuses = kycBonus + completionBonus + deliveryBonus + responseBonus;
        // ============ DISPUTE PENALTY ============
        let disputePenalty = Math.min(metrics.disputeCount * config.penalties.disputePerUnresolved, config.penalties.disputeMaxPenalty);
        breakdown.penalties.disputePenalty = disputePenalty;
        breakdown.components.push({
            name: 'DISPUTE_PENALTY',
            weight: 0,
            basePoints: -disputePenalty,
            adjustmentPoints: 0,
            finalPoints: -disputePenalty,
            explanation: `Dispute penalty: ${metrics.disputeCount} disputes × ${config.penalties.disputePerUnresolved} (capped at -${config.penalties.disputeMaxPenalty})`,
        });
        score -= disputePenalty;
        // ============ CANCELLATION PENALTY ============
        let cancellationPenalty = Math.min(metrics.cancellationCount * config.penalties.cancellationPerCancellation, config.penalties.cancellationMaxPenalty);
        breakdown.penalties.cancellationPenalty = cancellationPenalty;
        breakdown.components.push({
            name: 'CANCELLATION_PENALTY',
            weight: 0,
            basePoints: -cancellationPenalty,
            adjustmentPoints: 0,
            finalPoints: -cancellationPenalty,
            explanation: `Cancellation penalty: ${metrics.cancellationCount} cancellations × ${config.penalties.cancellationPerCancellation} (capped at -${config.penalties.cancellationMaxPenalty})`,
        });
        score -= cancellationPenalty;
        // ============ TIME DECAY PENALTY ============
        let timeDecayPenalty = 0;
        if (metrics.lastActivityDate) {
            const monthsInactive = Math.floor((Date.now() - metrics.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
            breakdown.calculations.monthsInactive = monthsInactive;
            if (monthsInactive > config.decay.startMonths) {
                const monthsOverThreshold = monthsInactive - config.decay.startMonths;
                timeDecayPenalty = Math.min(monthsOverThreshold * config.decay.ratePerMonth, config.decay.maxPenalty);
            }
        }
        breakdown.penalties.timDecayPenalty = timeDecayPenalty;
        breakdown.components.push({
            name: 'TIME_DECAY_PENALTY',
            weight: 0,
            basePoints: -timeDecayPenalty,
            adjustmentPoints: 0,
            finalPoints: -timeDecayPenalty,
            explanation: `Time decay: ${breakdown.calculations.monthsInactive} months inactive (penalty starts after ${config.decay.startMonths} months) -${timeDecayPenalty.toFixed(2)} points`,
        });
        score -= timeDecayPenalty;
        breakdown.penalties.totalPenalties = disputePenalty + cancellationPenalty + timeDecayPenalty;
        // ============ FINAL SCORE ============
        const finalScore = Math.max(0, Math.min(100, score));
        breakdown.finalScore = finalScore;
        // ============ CATEGORY ============
        if (finalScore >= config.thresholds.excellentThreshold) {
            breakdown.category = 'EXCELLENT';
        }
        else if (finalScore >= config.thresholds.goodThreshold) {
            breakdown.category = 'GOOD';
        }
        else if (finalScore >= config.thresholds.averageThreshold) {
            breakdown.category = 'AVERAGE';
        }
        else if (finalScore >= config.thresholds.belowAverageThreshold) {
            breakdown.category = 'BELOW_AVERAGE';
        }
        else {
            breakdown.category = 'POOR';
        }
        return breakdown;
    }
    /**
     * Generate recommendations based on trust score
     */
    function generateRecommendations(breakdown, config) {
        const recommendations = [];
        if (breakdown.finalScore < config.thresholds.goodThreshold) {
            recommendations.push('Improve your trust score by completing more orders successfully.');
        }
        if (breakdown.penalties.disputePenalty > 0) {
            recommendations.push(`You have ${Math.round(breakdown.penalties.disputePenalty / config.penalties.disputePerUnresolved)} active disputes. Resolve them to improve your score.`);
        }
        if (breakdown.penalties.cancellationPenalty > 0) {
            recommendations.push('Reduce order cancellations - consistent cancellations hurt your trust score.');
        }
        if (breakdown.bonuses.kycBonus < config.bonuses.kycAdvanced) {
            recommendations.push('Complete KYC verification to unlock higher trust tier bonuses.');
        }
        if ((breakdown.bonuses.completionBonus || 0) < config.bonuses.profileCompletenessMax) {
            recommendations.push('Complete your profile information to gain additional trust points.');
        }
        if (breakdown.calculations.avgResponse && breakdown.calculations.avgResponse > config.bonuses.responseTimeThresholdHours) {
            recommendations.push(`Respond to buyers faster than ${config.bonuses.responseTimeThresholdHours}h to earn response speed bonus.`);
        }
        if (breakdown.calculations.fulfillmentRate < 90) {
            recommendations.push('Improve your fulfillment rate to 90%+ to unlock delivery success bonuses.');
        }
        if (breakdown.calculations.monthsInactive > config.decay.startMonths) {
            recommendations.push(`You haven't had activity for ${breakdown.calculations.monthsInactive} months. Time decay is reducing your score. Complete a new order to reset.`);
        }
        return recommendations.slice(0, 5); // Return top 5 recommendations
    }
    /**
     * Get cached trust score or calculate
     */
    async function getTrustScore(farmerId, useCache = true) {
        // Try cache first
        if (useCache) {
            const cached = await redis.get(`${CACHE_KEY_PREFIX}${farmerId}`);
            if (cached) {
                const parsed = JSON.parse(cached);
                return {
                    ...parsed,
                    cached: true,
                };
            }
        }
        // Get from database
        const result = await db.query(`SELECT * FROM vault.farmer_trust_scores WHERE farmer_id = $1`, [farmerId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        const score = {
            farmerId: row.farmer_id,
            trustScoreNumeric: parseFloat(row.trust_score_numeric),
            trustScoreCategory: row.trust_score_category,
            baseScore: parseFloat(row.base_score_numeric),
            kycBonus: parseFloat(row.kyc_bonus_numeric),
            completionBonus: parseFloat(row.completion_bonus_numeric),
            deliverySuccessBonus: parseFloat(row.delivery_success_bonus_numeric),
            responseSpeedBonus: parseFloat(row.response_speed_bonus_numeric),
            disputePenalty: parseFloat(row.dispute_penalty_numeric),
            cancellationPenalty: parseFloat(row.cancellation_penalty_numeric),
            fraudPenalty: parseFloat(row.fraud_penalty_numeric),
            timeDecayPenalty: parseFloat(row.time_decay_penalty_numeric),
            completedOrdersCount: row.completed_orders_count,
            totalOrdersCount: row.total_orders_count,
            averageRating: row.average_rating_numeric ? parseFloat(row.average_rating_numeric) : null,
            totalReviewsCount: row.total_reviews_count,
            fulfillmentRate: parseFloat(row.fulfillment_rate_numeric),
            averageResponseTimeHours: row.average_response_time_hours,
            kycLevel: row.kyc_level,
            profileCompleteness: row.profile_completeness_numeric ? parseFloat(row.profile_completeness_numeric) : null,
            disputeCount: row.dispute_count,
            cancellationCount: row.cancellation_count,
            calculatedAt: new Date(row.calculated_at),
            recalculationTriggeredAt: row.recalculation_triggered_at ? new Date(row.recalculation_triggered_at) : null,
            calculationMethod: row.calculation_method,
            dayssSinceActivity: row.days_since_activity,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
        // Reconstruct breakdown from database
        const componentsResult = await db.query(`SELECT * FROM vault.farmer_trust_score_components WHERE farmer_id = $1 ORDER BY weight_percentage DESC`, [farmerId]);
        const breakdown = {
            farmerId,
            baseScore: score.baseScore,
            components: componentsResult.rows.map((c) => ({
                name: c.component_name,
                weight: parseFloat(c.weight_percentage),
                basePoints: parseFloat(c.base_points),
                adjustmentPoints: parseFloat(c.adjustment_points),
                finalPoints: parseFloat(c.final_points),
                explanation: c.adjustment_reason || '',
            })),
            bonuses: {
                kycBonus: score.kycBonus,
                completionBonus: score.completionBonus,
                deliverySuccessBonus: score.deliverySuccessBonus,
                responseSpeedBonus: score.responseSpeedBonus,
                totalBonuses: score.kycBonus +
                    score.completionBonus +
                    score.deliverySuccessBonus +
                    score.responseSpeedBonus,
            },
            penalties: {
                disputePenalty: score.disputePenalty,
                cancellationPenalty: score.cancellationPenalty,
                fraudPenalty: score.fraudPenalty,
                timDecayPenalty: score.timeDecayPenalty,
                totalPenalties: score.disputePenalty +
                    score.cancellationPenalty +
                    score.fraudPenalty +
                    score.timeDecayPenalty,
            },
            finalScore: score.trustScoreNumeric,
            category: score.trustScoreCategory,
            calculations: {
                completionRate: score.completedOrdersCount > 0 ? (score.completedOrdersCount / score.totalOrdersCount) * 100 : 0,
                fulfillmentRate: score.fulfillmentRate,
                avgResponse: score.averageResponseTimeHours,
                kycLevel: score.kycLevel,
                monthsInactive: score.dayssSinceActivity ? Math.floor(score.dayssSinceActivity / 30) : 0,
            },
        };
        // Cache the result
        if (useCache) {
            await redis.setEx(`${CACHE_KEY_PREFIX}${farmerId}`, CACHE_CONFIG.ttlSeconds, JSON.stringify({ score, breakdown, cached: false }));
        }
        return {
            score,
            breakdown,
            cached: false,
        };
    }
    /**
     * Calculate and store trust score
     */
    async function calculateAndStoreTrustScore(request) {
        const config = await loadScoringConfig();
        const metrics = request.metrics;
        const breakdown = calculateTrustScore(metrics, config);
        breakdown.farmerId = request.farmerId;
        // Get previous score for comparison
        const previousTrustScoreData = await getTrustScore(request.farmerId, false);
        const previousScore = previousTrustScoreData?.score.trustScoreNumeric || 50;
        // Store in database
        await db.query(`INSERT INTO vault.farmer_trust_scores (
        farmer_id, trust_score_numeric, trust_score_category,
        base_score_numeric, kyc_bonus_numeric, completion_bonus_numeric,
        delivery_success_bonus_numeric, response_speed_bonus_numeric,
        dispute_penalty_numeric, cancellation_penalty_numeric,
        fraud_penalty_numeric, time_decay_penalty_numeric,
        completed_orders_count, total_orders_count,
        average_rating_numeric, total_reviews_count,
        fulfillment_rate_numeric, average_response_time_hours,
        kyc_level, profile_completeness_numeric,
        dispute_count, cancellation_count,
        last_activity_date, calculation_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (farmer_id) DO UPDATE SET
        trust_score_numeric = EXCLUDED.trust_score_numeric,
        trust_score_category = EXCLUDED.trust_score_category,
        base_score_numeric = EXCLUDED.base_score_numeric,
        kyc_bonus_numeric = EXCLUDED.kyc_bonus_numeric,
        completion_bonus_numeric = EXCLUDED.completion_bonus_numeric,
        delivery_success_bonus_numeric = EXCLUDED.delivery_success_bonus_numeric,
        response_speed_bonus_numeric = EXCLUDED.response_speed_bonus_numeric,
        dispute_penalty_numeric = EXCLUDED.dispute_penalty_numeric,
        cancellation_penalty_numeric = EXCLUDED.cancellation_penalty_numeric,
        fraud_penalty_numeric = EXCLUDED.fraud_penalty_numeric,
        time_decay_penalty_numeric = EXCLUDED.time_decay_penalty_numeric,
        completed_orders_count = EXCLUDED.completed_orders_count,
        total_orders_count = EXCLUDED.total_orders_count,
        average_rating_numeric = EXCLUDED.average_rating_numeric,
        total_reviews_count = EXCLUDED.total_reviews_count,
        fulfillment_rate_numeric = EXCLUDED.fulfillment_rate_numeric,
        average_response_time_hours = EXCLUDED.average_response_time_hours,
        kyc_level = EXCLUDED.kyc_level,
        profile_completeness_numeric = EXCLUDED.profile_completeness_numeric,
        dispute_count = EXCLUDED.dispute_count,
        cancellation_count = EXCLUDED.cancellation_count,
        last_activity_date = EXCLUDED.last_activity_date,
        calculation_method = EXCLUDED.calculation_method,
        calculated_at = NOW(),
        updated_at = NOW()
      RETURNING id`, [
            request.farmerId,
            breakdown.finalScore,
            breakdown.category,
            breakdown.baseScore,
            breakdown.bonuses.kycBonus,
            breakdown.bonuses.completionBonus,
            breakdown.bonuses.deliverySuccessBonus,
            breakdown.bonuses.responseSpeedBonus,
            breakdown.penalties.disputePenalty,
            breakdown.penalties.cancellationPenalty,
            breakdown.penalties.fraudPenalty,
            breakdown.penalties.timDecayPenalty,
            metrics.completedOrdersCount,
            metrics.totalOrdersCount,
            metrics.averageRating,
            metrics.totalReviewsCount,
            metrics.fulfillmentRate,
            metrics.averageResponseTimeHours,
            metrics.kycLevel,
            metrics.profileCompleteness,
            metrics.disputeCount,
            metrics.cancellationCount,
            metrics.lastActivityDate,
            'WEIGHTED_ALGORITHM',
        ]);
        // Store components
        for (const component of breakdown.components) {
            await db.query(`INSERT INTO vault.farmer_trust_score_components (
          farmer_id, trust_score_id, component_name,
          weight_percentage, base_points, adjustment_points, adjustment_reason
        ) VALUES ($1, (SELECT id FROM vault.farmer_trust_scores WHERE farmer_id = $1), $2, $3, $4, $5, $6)`, [
                request.farmerId,
                component.name,
                component.weight,
                component.basePoints,
                component.adjustmentPoints,
                component.explanation,
            ]);
        }
        // Record history
        if (previousScore !== breakdown.finalScore) {
            await db.query(`INSERT INTO vault.farmer_trust_score_history (
          farmer_id, previous_score_numeric, new_score_numeric,
          change_reason, metadata, related_order_id, related_dispute_id, related_review_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                request.farmerId,
                previousScore,
                breakdown.finalScore,
                request.changeReason || 'RECALCULATION',
                request.metadata || null,
                request.relatedOrderId || null,
                request.relatedDisputeId || null,
                request.relatedReviewId || null,
            ]);
        }
        // Invalidate cache
        await redis.del(`${CACHE_KEY_PREFIX}${request.farmerId}`);
        // Get updated score
        const updated = await getTrustScore(request.farmerId, false);
        return {
            farmerId: request.farmerId,
            trustScore: updated.score,
            breakdown,
            history: [],
            previousScore,
            scoreChange: breakdown.finalScore - previousScore,
            cached: false,
            cacheExpiry: new Date(Date.now() + CACHE_CONFIG.ttlSeconds * 1000),
        };
    }
    /**
     * Get trust score summary statistics
     */
    async function getTrustScoreSummaryStats() {
        const stats = await db.query(`
      SELECT
        COUNT(*) as total_farmers,
        AVG(trust_score_numeric) as avg_score,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trust_score_numeric) as median_score,
        SUM(CASE WHEN trust_score_numeric >= 85 THEN 1 ELSE 0 END) as excellent,
        SUM(CASE WHEN trust_score_numeric >= 70 AND trust_score_numeric < 85 THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN trust_score_numeric >= 50 AND trust_score_numeric < 70 THEN 1 ELSE 0 END) as average,
        SUM(CASE WHEN trust_score_numeric >= 30 AND trust_score_numeric < 50 THEN 1 ELSE 0 END) as below_average,
        SUM(CASE WHEN trust_score_numeric < 30 THEN 1 ELSE 0 END) as poor,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY trust_score_numeric) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY trust_score_numeric) as p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY trust_score_numeric) as p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY trust_score_numeric) as p95
      FROM vault.farmer_trust_scores
    `);
        const row = stats.rows[0];
        return {
            totalFarmers: parseInt(row.total_farmers),
            avgTrustScore: parseFloat(row.avg_score || 50),
            medianTrustScore: parseFloat(row.median_score || 50),
            distribution: {
                excellent: parseInt(row.excellent || 0),
                good: parseInt(row.good || 0),
                average: parseInt(row.average || 0),
                belowAverage: parseInt(row.below_average || 0),
                poor: parseInt(row.poor || 0),
            },
            percentileRanks: {
                percentile50: parseFloat(row.p50 || 50),
                percentile75: parseFloat(row.p75 || 75),
                percentile90: parseFloat(row.p90 || 90),
                percentile95: parseFloat(row.p95 || 95),
            },
            recommendations: {
                needsKycUpgrade: [],
                highDisputes: [],
                inactiveChurn: [],
            },
        };
    }
    // Return service interface
    return {
        loadScoringConfig,
        calculateTrustScore,
        generateRecommendations,
        getTrustScore,
        calculateAndStoreTrustScore,
        getTrustScoreSummaryStats,
    };
}
