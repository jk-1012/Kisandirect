/**
 * Trust Score Routes
 * API endpoints for farmers to view their trust score and breakdown
 */
import { z } from 'zod';
import { queueTrustScoreRecalculation } from '../jobs/trust-score-workers';
/**
 * Register trust score routes
 */
export async function registerTrustScoreRoutes(server, trustScoreService) {
    /**
     * GET /farmers/:id/trust-score
     * Get trust score, breakdown, and recommendations for a farmer
     */
    server.get('/farmers/:farmerId/trust-score', {
        schema: {
            params: z.object({
                farmerId: z.string().uuid('Invalid farmer ID'),
            }),
            querystring: z.object({
                detailed: z.enum(['true', 'false']).optional().default('false'),
                includeHistory: z.enum(['true', 'false']).optional().default('false'),
            }),
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                    },
                },
                404: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const { farmerId } = request.params;
        const { detailed, includeHistory } = request.query;
        try {
            // Get trust score
            const trustScoreData = await trustScoreService.getTrustScore(farmerId, true);
            if (!trustScoreData) {
                return reply.status(404).send({
                    success: false,
                    error: 'Farmer not found or trust score not calculated',
                });
            }
            const { score, breakdown } = trustScoreData;
            const config = await trustScoreService.loadScoringConfig();
            const recommendations = trustScoreService.generateRecommendations(breakdown, config);
            // Get summary stats for percentile
            const summaryStats = await trustScoreService.getTrustScoreSummaryStats();
            // Calculate percentile
            const percentile = Math.round((summaryStats.distribution.poor +
                summaryStats.distribution.belowAverage +
                (score.trustScoreNumeric - summaryStats.percentileRanks.percentile50) /
                    (summaryStats.percentileRanks.percentile95 -
                        summaryStats.percentileRanks.percentile50) *
                    (summaryStats.distribution.good + summaryStats.distribution.excellent)) /
                summaryStats.totalFarmers *
                100);
            // Build response
            const response = {
                success: true,
                data: {
                    farmerId,
                    trustScore: {
                        value: parseFloat(score.trustScoreNumeric.toFixed(2)),
                        category: score.trustScoreCategory,
                        percentile: Math.max(0, Math.min(100, percentile)),
                        lastUpdated: score.calculatedAt.toISOString(),
                        updateFrequency: 'Daily or on trigger event',
                    },
                    metrics: {
                        completedOrders: score.completedOrdersCount,
                        totalOrders: score.totalOrdersCount,
                        completionRate: score.completedOrdersCount > 0 ? parseFloat(((score.completedOrdersCount / score.totalOrdersCount) * 100).toFixed(1)) : 0,
                        averageRating: score.averageRating ? parseFloat(score.averageRating.toFixed(2)) : null,
                        ratingCount: score.totalReviewsCount,
                        fulfillmentRate: parseFloat(score.fulfillmentRate.toFixed(1)),
                        responseTimeHours: score.averageResponseTimeHours,
                        kycLevel: score.kycLevel,
                        profileCompleteness: score.profileCompleteness
                            ? parseFloat(score.profileCompleteness.toFixed(1))
                            : null,
                        disputes: score.disputeCount,
                        cancellations: score.cancellationCount,
                        daysInactive: score.dayssSinceActivity,
                    },
                    recommendations: recommendations,
                },
            };
            // Add detailed breakdown if requested
            if (detailed === 'true') {
                response.data.breakdown = {
                    baseScore: parseFloat(breakdown.baseScore.toFixed(2)),
                    components: breakdown.components.map((c) => ({
                        name: c.name,
                        weight: parseFloat(c.weight.toFixed(2)),
                        basePoints: parseFloat(c.basePoints.toFixed(2)),
                        adjustmentPoints: parseFloat(c.adjustmentPoints.toFixed(2)),
                        finalPoints: parseFloat(c.finalPoints.toFixed(2)),
                        explanation: c.explanation,
                    })),
                    bonuses: {
                        kyc: parseFloat(breakdown.bonuses.kycBonus.toFixed(2)),
                        completion: parseFloat(breakdown.bonuses.completionBonus.toFixed(2)),
                        deliverySuccess: parseFloat(breakdown.bonuses.deliverySuccessBonus.toFixed(2)),
                        responseSpeed: parseFloat(breakdown.bonuses.responseSpeedBonus.toFixed(2)),
                        total: parseFloat(breakdown.bonuses.totalBonuses.toFixed(2)),
                    },
                    penalties: {
                        disputes: parseFloat(breakdown.penalties.disputePenalty.toFixed(2)),
                        cancellations: parseFloat(breakdown.penalties.cancellationPenalty.toFixed(2)),
                        fraud: parseFloat(breakdown.penalties.fraudPenalty.toFixed(2)),
                        timeDecay: parseFloat(breakdown.penalties.timDecayPenalty.toFixed(2)),
                        total: parseFloat(breakdown.penalties.totalPenalties.toFixed(2)),
                    },
                    finalScore: parseFloat(breakdown.finalScore.toFixed(2)),
                    category: breakdown.category,
                };
            }
            return reply.send(response);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            server.log.error(`Error fetching trust score for farmer ${farmerId}: ${errorMsg}`);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch trust score',
            });
        }
    });
    /**
     * GET /farmers/:id/trust-score/percentiles
     * Get trust score percentiles and distribution
     */
    server.get('/farmers/:farmerId/trust-score/percentiles', async (request, reply) => {
        try {
            const summaryStats = await trustScoreService.getTrustScoreSummaryStats();
            return reply.send({
                success: true,
                data: {
                    totalFarmers: summaryStats.totalFarmers,
                    average: parseFloat(summaryStats.avgTrustScore.toFixed(2)),
                    median: parseFloat(summaryStats.medianTrustScore.toFixed(2)),
                    distribution: {
                        excellent: {
                            count: summaryStats.distribution.excellent,
                            percentage: ((summaryStats.distribution.excellent / summaryStats.totalFarmers) * 100).toFixed(1),
                        },
                        good: {
                            count: summaryStats.distribution.good,
                            percentage: ((summaryStats.distribution.good / summaryStats.totalFarmers) * 100).toFixed(1),
                        },
                        average: {
                            count: summaryStats.distribution.average,
                            percentage: ((summaryStats.distribution.average / summaryStats.totalFarmers) * 100).toFixed(1),
                        },
                        belowAverage: {
                            count: summaryStats.distribution.belowAverage,
                            percentage: ((summaryStats.distribution.belowAverage / summaryStats.totalFarmers) * 100).toFixed(1),
                        },
                        poor: {
                            count: summaryStats.distribution.poor,
                            percentage: ((summaryStats.distribution.poor / summaryStats.totalFarmers) * 100).toFixed(1),
                        },
                    },
                    percentiles: {
                        p50: parseFloat(summaryStats.percentileRanks.percentile50.toFixed(2)),
                        p75: parseFloat(summaryStats.percentileRanks.percentile75.toFixed(2)),
                        p90: parseFloat(summaryStats.percentileRanks.percentile90.toFixed(2)),
                        p95: parseFloat(summaryStats.percentileRanks.percentile95.toFixed(2)),
                    },
                },
            });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            server.log.error(`Error fetching trust score percentiles: ${errorMsg}`);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch percentiles',
            });
        }
    });
    /**
     * POST /admin/trust-score/recalculate/:farmerId
     * Admin endpoint to manually trigger trust score recalculation
     */
    server.post('/admin/trust-score/recalculate/:farmerId', {
        schema: {
            params: z.object({
                farmerId: z.string().uuid('Invalid farmer ID'),
            }),
            body: z.object({
                priority: z.number().int().min(1).max(10).optional().default(5),
            }),
        },
    }, async (request, reply) => {
        try {
            // Check admin authorization
            const user = request.user;
            if (!user || user.role !== 'ADMIN') {
                return reply.status(403).send({
                    success: false,
                    error: 'Only admins can manually recalculate trust scores',
                });
            }
            const { farmerId } = request.params;
            const { priority } = request.body;
            const result = await queueTrustScoreRecalculation(server, farmerId, 'MANUAL_ADMIN_TRIGGER', priority || 5);
            return reply.status(202).send({
                success: true,
                message: 'Trust score recalculation queued',
                queueId: result.queueId,
            });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            server.log.error(`Error queuing trust score recalculation: ${errorMsg}`);
            return reply.status(500).send({
                success: false,
                error: 'Failed to queue recalculation',
            });
        }
    });
    /**
     * POST /admin/trust-score/recalculate-batch
     * Admin endpoint to trigger batch recalculation
     */
    server.post('/admin/trust-score/recalculate-batch', {
        schema: {
            body: z.object({
                trustScoreBelow: z.number().optional(),
                trustScoreAbove: z.number().optional(),
                inactiveForDays: z.number().int().optional(),
                kycLevel: z.enum(['NONE', 'BASIC', 'VERIFIED', 'ADVANCED']).optional(),
                batchSize: z.number().int().min(10).max(10000).optional().default(100),
                priority: z.number().int().min(1).max(10).optional().default(3),
            }),
        },
    }, async (request, reply) => {
        try {
            // Check admin authorization
            const user = request.user;
            if (!user || user.role !== 'ADMIN') {
                return reply.status(403).send({
                    success: false,
                    error: 'Only admins can trigger batch recalculations',
                });
            }
            const { trustScoreBelow, trustScoreAbove, inactiveForDays, kycLevel, batchSize, priority } = request.body;
            // Queue batch recalculation as a job
            const queue = server.queues.payoutQueue;
            await queue.add('BATCH_RECALCULATE_TRUST_SCORES', {
                filters: {
                    trustScoreBelow,
                    trustScoreAbove,
                    inactiveForDays,
                    kycLevel,
                },
                batchSize,
                priority,
            }, {
                jobId: `batch_trust_score_${Date.now()}`,
                priority: priority || 3,
                attempts: 1,
            });
            return reply.status(202).send({
                success: true,
                message: 'Batch trust score recalculation initiated',
                filters: {
                    trustScoreBelow,
                    trustScoreAbove,
                    inactiveForDays,
                    kycLevel,
                },
                batchSize,
            });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            server.log.error(`Error initiating batch trust score recalculation: ${errorMsg}`);
            return reply.status(500).send({
                success: false,
                error: 'Failed to initiate batch recalculation',
            });
        }
    });
}
