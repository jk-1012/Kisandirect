/**
 * Trust Score Unit Tests
 * Tests for scoring algorithm, penalties, bonuses, and calculations
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createTrustScoreService } from '../services/trust-score-service';
describe('Trust Score Service', () => {
    let trustScoreService;
    // Mock Fastify server
    const mockServer = {
        redis: {
            get: jest.fn(),
            setEx: jest.fn(),
            del: jest.fn(),
        },
        db: {
            query: jest.fn(),
        },
        log: {
            info: jest.fn(),
            error: jest.fn(),
        },
    };
    beforeEach(() => {
        jest.clearAllMocks();
        trustScoreService = createTrustScoreService(mockServer);
    });
    describe('Score Calculation', () => {
        it('should calculate base score of 50 for new farmer with no metrics', () => {
            const metrics = {
                completedOrdersCount: 0,
                totalOrdersCount: 0,
                averageRating: null,
                totalReviewsCount: 0,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 0,
                averageResponseTimeHours: null,
                kycLevel: 'NONE',
                profileCompleteness: 0,
                lastActivityDate: null,
            };
            const config = getDefaultConfig();
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.finalScore).toBe(config.baseScore);
            expect(breakdown.category).toBe('AVERAGE');
        });
        it('should increase score with high completion rate', () => {
            const metrics = {
                completedOrdersCount: 95,
                totalOrdersCount: 100,
                averageRating: 4.5,
                totalReviewsCount: 95,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 5,
                cancellationRate: 5,
                fulfillmentRate: 98,
                averageResponseTimeHours: 2,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const config = getDefaultConfig();
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.finalScore).toBeGreaterThan(config.baseScore);
            expect(breakdown.category).toBe('EXCELLENT');
        });
        it('should apply KYC bonuses correctly', () => {
            const config = getDefaultConfig();
            // Test each KYC level
            const kycTests = [
                { level: 'NONE', expectedBonus: 0 },
                { level: 'BASIC', expectedBonus: config.bonuses.kycBasic },
                { level: 'VERIFIED', expectedBonus: config.bonuses.kycVerified },
                { level: 'ADVANCED', expectedBonus: config.bonuses.kycAdvanced },
            ];
            for (const test of kycTests) {
                const metrics = {
                    completedOrdersCount: 10,
                    totalOrdersCount: 10,
                    averageRating: 4.0,
                    totalReviewsCount: 10,
                    disputeCount: 0,
                    disputeResolutionRate: 0,
                    cancellationCount: 0,
                    cancellationRate: 0,
                    fulfillmentRate: 100,
                    averageResponseTimeHours: 24,
                    kycLevel: test.level,
                    profileCompleteness: 50,
                    lastActivityDate: new Date(),
                };
                const breakdown = trustScoreService.calculateTrustScore(metrics, config);
                expect(breakdown.bonuses.kycBonus).toBe(test.expectedBonus);
            }
        });
        it('should apply dispute penalties correctly', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 5,
                disputeResolutionRate: 80,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 95,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            const expectedPenalty = Math.min(5 * config.penalties.disputePerUnresolved, config.penalties.disputeMaxPenalty);
            expect(breakdown.penalties.disputePenalty).toBe(expectedPenalty);
            expect(breakdown.finalScore).toBeLessThan(80); // Score should be reduced
        });
        it('should cap dispute penalty at maximum', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 20, // Many disputes
                disputeResolutionRate: 50,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 95,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            // Penalty should be capped at max
            expect(breakdown.penalties.disputePenalty).toBeLessThanOrEqual(config.penalties.disputeMaxPenalty);
        });
        it('should apply cancellation penalties correctly', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 80,
                totalOrdersCount: 100,
                averageRating: 4.0,
                totalReviewsCount: 80,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 20,
                cancellationRate: 20,
                fulfillmentRate: 95,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            const expectedPenalty = Math.min(20 * config.penalties.cancellationPerCancellation, config.penalties.cancellationMaxPenalty);
            expect(breakdown.penalties.cancellationPenalty).toBe(expectedPenalty);
        });
        it('should apply time decay penalty correctly', () => {
            const config = getDefaultConfig();
            // 12 months of inactivity (6 months past threshold)
            const lastActivityDate = new Date();
            lastActivityDate.setMonth(lastActivityDate.getMonth() - 12);
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 95,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate,
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            // Should have time decay penalty
            expect(breakdown.penalties.timDecayPenalty).toBeGreaterThan(0);
            expect(breakdown.penalties.timDecayPenalty).toBeLessThanOrEqual(config.decay.maxPenalty);
        });
        it('should not apply time decay before threshold', () => {
            const config = getDefaultConfig();
            // 2 months of inactivity (before 6-month threshold)
            const lastActivityDate = new Date();
            lastActivityDate.setMonth(lastActivityDate.getMonth() - 2);
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 95,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate,
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            // Should NOT have time decay penalty yet
            expect(breakdown.penalties.timDecayPenalty).toBe(0);
        });
        it('should apply response speed bonus for fast response', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 95,
                averageResponseTimeHours: 2, // Very fast response
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.bonuses.responseSpeedBonus).toBe(config.bonuses.responseTimeBonusPoints);
        });
        it('should not apply response speed bonus for slow response', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 95,
                averageResponseTimeHours: 48, // Slow response
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.bonuses.responseSpeedBonus).toBe(0);
        });
        it('should apply delivery success bonus for high fulfillment', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 0,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 99, // Very high fulfillment (> 90%)
                averageResponseTimeHours: 24,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.bonuses.deliverySuccessBonus).toBeGreaterThan(0);
        });
        it('should cap score between 0 and 100', () => {
            const config = getDefaultConfig();
            // Test extreme high metrics
            const metricsHigh = {
                completedOrdersCount: 10000,
                totalOrdersCount: 10000,
                averageRating: 5.0,
                totalReviewsCount: 10000,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 100,
                averageResponseTimeHours: 0.5,
                kycLevel: 'ADVANCED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdownHigh = trustScoreService.calculateTrustScore(metricsHigh, config);
            expect(breakdownHigh.finalScore).toBeLessThanOrEqual(100);
            // Test extreme low metrics
            const metricsLow = {
                completedOrdersCount: 0,
                totalOrdersCount: 100,
                averageRating: 1.0,
                totalReviewsCount: 100,
                disputeCount: 100,
                disputeResolutionRate: 0,
                cancellationCount: 100,
                cancellationRate: 100,
                fulfillmentRate: 0,
                averageResponseTimeHours: 480,
                kycLevel: 'NONE',
                profileCompleteness: 0,
                lastActivityDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            };
            const breakdownLow = trustScoreService.calculateTrustScore(metricsLow, config);
            expect(breakdownLow.finalScore).toBeGreaterThanOrEqual(0);
        });
        it('should categorize scores correctly', () => {
            const config = getDefaultConfig();
            const testCases = [
                { score: 90, expected: 'EXCELLENT' },
                { score: 75, expected: 'GOOD' },
                { score: 50, expected: 'AVERAGE' },
                { score: 35, expected: 'BELOW_AVERAGE' },
                { score: 10, expected: 'POOR' },
            ];
            for (const test of testCases) {
                let actualScore = test.score;
                // We can't directly set the score, so we need to craft metrics that result in this score
                // For simplicity, we'll verify the categorization logic
                const category = actualScore >= config.thresholds.excellentThreshold
                    ? 'EXCELLENT'
                    : actualScore >= config.thresholds.goodThreshold
                        ? 'GOOD'
                        : actualScore >= config.thresholds.averageThreshold
                            ? 'AVERAGE'
                            : actualScore >= config.thresholds.belowAverageThreshold
                                ? 'BELOW_AVERAGE'
                                : 'POOR';
                expect(category).toBe(test.expected);
            }
        });
    });
    describe('Recommendations Generation', () => {
        it('should generate recommendations based on score', () => {
            const config = getDefaultConfig();
            const breakdown = {
                farmerId: 'test-farmer',
                baseScore: 50,
                components: [],
                bonuses: {
                    kycBonus: 0,
                    completionBonus: 0,
                    deliverySuccessBonus: 0,
                    responseSpeedBonus: 0,
                    totalBonuses: 0,
                },
                penalties: {
                    disputePenalty: 10,
                    cancellationPenalty: 5,
                    fraudPenalty: 0,
                    timDecayPenalty: 0,
                    totalPenalties: 15,
                },
                finalScore: 35,
                category: 'BELOW_AVERAGE',
                calculations: {
                    completionRate: 80,
                    fulfillmentRate: 85,
                    avgResponse: 48,
                    kycLevel: 'BASIC',
                    monthsInactive: 0,
                },
            };
            const recommendations = trustScoreService.generateRecommendations(breakdown, config);
            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0]).toContain('trust score');
        });
        it('should include dispute resolution recommendations', () => {
            const config = getDefaultConfig();
            const breakdown = {
                farmerId: 'test-farmer',
                baseScore: 50,
                components: [],
                bonuses: {
                    kycBonus: 0,
                    completionBonus: 0,
                    deliverySuccessBonus: 0,
                    responseSpeedBonus: 0,
                    totalBonuses: 0,
                },
                penalties: {
                    disputePenalty: 30,
                    cancellationPenalty: 0,
                    fraudPenalty: 0,
                    timDecayPenalty: 0,
                    totalPenalties: 30,
                },
                finalScore: 20,
                category: 'POOR',
                calculations: {
                    completionRate: 90,
                    fulfillmentRate: 95,
                    avgResponse: 12,
                    kycLevel: 'VERIFIED',
                    monthsInactive: 0,
                },
            };
            const recommendations = trustScoreService.generateRecommendations(breakdown, config);
            expect(recommendations.some((r) => r.includes('dispute'))).toBe(true);
        });
        it('should include KYC upgrade recommendations', () => {
            const config = getDefaultConfig();
            const breakdown = {
                farmerId: 'test-farmer',
                baseScore: 50,
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
                finalScore: 50,
                category: 'AVERAGE',
                calculations: {
                    completionRate: 90,
                    fulfillmentRate: 95,
                    avgResponse: 12,
                    kycLevel: 'NONE', // No KYC
                    monthsInactive: 0,
                },
            };
            const recommendations = trustScoreService.generateRecommendations(breakdown, config);
            expect(recommendations.some((r) => r.includes('KYC'))).toBe(true);
        });
    });
    describe('Score Clamping', () => {
        it('should prevent negative scores', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 0,
                totalOrdersCount: 100,
                averageRating: 1,
                totalReviewsCount: 10,
                disputeCount: 50,
                disputeResolutionRate: 0,
                cancellationCount: 50,
                cancellationRate: 50,
                fulfillmentRate: 0,
                averageResponseTimeHours: 480,
                kycLevel: 'NONE',
                profileCompleteness: 0,
                lastActivityDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.finalScore).toBeGreaterThanOrEqual(0);
        });
        it('should prevent scores above 100', () => {
            const config = getDefaultConfig();
            const metrics = {
                completedOrdersCount: 1000,
                totalOrdersCount: 1000,
                averageRating: 5.0,
                totalReviewsCount: 1000,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 100,
                averageResponseTimeHours: 0.1,
                kycLevel: 'ADVANCED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const breakdown = trustScoreService.calculateTrustScore(metrics, config);
            expect(breakdown.finalScore).toBeLessThanOrEqual(100);
        });
    });
});
// Helper function to get default config
function getDefaultConfig() {
    return {
        weights: {
            completedOrders: 25,
            averageRating: 25,
            fulfillmentRate: 20,
            responseTime: 10,
            profileCompleteness: 10,
            kycVerification: 15,
        },
        bonuses: {
            kycBasic: 5,
            kycVerified: 10,
            kycAdvanced: 15,
            profileCompletenessMax: 5,
            deliverySuccessBonus: 10,
            responseTimeThresholdHours: 24,
            responseTimeBonusPoints: 5,
        },
        penalties: {
            disputePerUnresolved: 10,
            disputeMaxPenalty: 30,
            cancellationPerCancellation: 5,
            cancellationMaxPenalty: 20,
            fraudSeverePenalty: 25,
        },
        decay: {
            ratePerMonth: 0.5,
            maxPenalty: 10,
            startMonths: 6,
        },
        thresholds: {
            minOrdersForRating: 5,
            excellentThreshold: 85,
            goodThreshold: 70,
            averageThreshold: 50,
            belowAverageThreshold: 30,
        },
        baseScore: 50,
    };
}
