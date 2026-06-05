/**
 * Trust Score Integration Tests
 * End-to-end tests with database, caching, and workers
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { createTrustScoreService } from '../services/trust-score-service';
// Helper to generate UUID-like string
const generateId = () => `${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
describe('Trust Score Integration Tests', () => {
    let mockDb;
    let mockRedis;
    let mockServer;
    let trustScoreService;
    beforeAll(async () => {
        // Setup mocks
        mockDb = {
            query: jest.fn(),
        };
        mockRedis = {
            get: jest.fn(),
            setEx: jest.fn(),
            del: jest.fn(),
        };
        mockServer = {
            redis: mockRedis,
            db: mockDb,
            log: {
                info: jest.fn(),
                error: jest.fn(),
            },
        };
        trustScoreService = createTrustScoreService(mockServer);
    });
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('Score Persistence', () => {
        it('should save trust score to database', async () => {
            const farmerId = generateId();
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 98,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
                changeReason: 'COMPLETED_ORDER',
            };
            const result = await trustScoreService.calculateAndStoreTrustScore(request);
            expect(result.trustScore.farmerId).toBe(farmerId);
            expect(result.trustScore.trustScoreNumeric).toBeGreaterThan(0);
            expect(result.trustScore.trustScoreNumeric).toBeLessThanOrEqual(100);
            expect(mockDb.query).toHaveBeenCalled();
        });
        it('should record trust score history on change', async () => {
            const farmerId = generateId();
            // Mock existing score of 50
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    {
                        farmer_id: farmerId,
                        trust_score_numeric: 50,
                        trust_score_category: 'AVERAGE',
                        base_score_numeric: 50,
                        kyc_bonus_numeric: 0,
                        completion_bonus_numeric: 0,
                        delivery_success_bonus_numeric: 0,
                        response_speed_bonus_numeric: 0,
                        dispute_penalty_numeric: 0,
                        cancellation_penalty_numeric: 0,
                        fraud_penalty_numeric: 0,
                        time_decay_penalty_numeric: 0,
                        completed_orders_count: 10,
                        total_orders_count: 10,
                        average_rating_numeric: 4.0,
                        total_reviews_count: 10,
                        fulfillment_rate_numeric: 90,
                        average_response_time_hours: 24,
                        kyc_level: 'BASIC',
                        profile_completeness_numeric: 50,
                        dispute_count: 0,
                        cancellation_count: 0,
                        calculated_at: new Date(),
                        days_since_activity: 0,
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            });
            // Mock components query
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            // Return null for first getTrustScore call (fallback)
            mockRedis.get.mockResolvedValue(null);
            const metrics = {
                completedOrdersCount: 60,
                totalOrdersCount: 60,
                averageRating: 4.8,
                totalReviewsCount: 60,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 100,
                averageResponseTimeHours: 6,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
                changeReason: 'NEW_REVIEW',
            };
            const result = await trustScoreService.calculateAndStoreTrustScore(request);
            // Score should have increased
            expect(result.scoreChange).toBeGreaterThan(0);
            // History should be recorded
            // Check that INSERT INTO history was called
            const queryCalls = mockDb.query.mock.calls;
            const historyInsertCall = queryCalls.find((call) => call[0].includes('INSERT INTO vault.farmer_trust_score_history'));
            expect(historyInsertCall).toBeDefined();
        });
    });
    describe('Caching', () => {
        it('should return cached score', async () => {
            const farmerId = generateId();
            const cachedData = {
                score: {
                    farmerId,
                    trustScoreNumeric: 75,
                    trustScoreCategory: 'GOOD',
                },
                breakdown: {
                    finalScore: 75,
                    category: 'GOOD',
                },
                cached: false,
            };
            mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));
            const result = await trustScoreService.getTrustScore(farmerId, true);
            expect(result?.cached).toBe(true);
            expect(result?.score.trustScoreNumeric).toBe(75);
            expect(mockDb.query).not.toHaveBeenCalled(); // DB query should not happen
        });
        it('should invalidate cache after recalculation', async () => {
            const farmerId = generateId();
            mockRedis.get.mockResolvedValue(null);
            mockDb.query.mockResolvedValue({ rows: [] });
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 98,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
            };
            await trustScoreService.calculateAndStoreTrustScore(request);
            // Cache should be invalidated
            expect(mockRedis.del).toHaveBeenCalledWith(`trust_score:${farmerId}`);
        });
        it('should re-cache after recalculation', async () => {
            const farmerId = generateId();
            mockRedis.get.mockResolvedValue(null);
            mockDb.query.mockResolvedValue({ rows: [] });
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 98,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
            };
            await trustScoreService.calculateAndStoreTrustScore(request);
            // New cache should be set
            expect(mockRedis.setEx).toHaveBeenCalled();
            const setCalls = mockRedis.setEx.mock.calls;
            const trustScoreCacheCall = setCalls.find((call) => call[0].includes(`trust_score:${farmerId}`));
            expect(trustScoreCacheCall).toBeDefined();
        });
    });
    describe('Metric Aggregation', () => {
        it('should handle missing metrics gracefully', async () => {
            const farmerId = generateId();
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
                profileCompleteness: null,
                lastActivityDate: null,
            };
            const request = {
                farmerId,
                metrics,
            };
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const result = await trustScoreService.calculateAndStoreTrustScore(request);
            expect(result.trustScore.trustScoreNumeric).toBe(50); // Base score
            expect(result.trustScore.trustScoreCategory).toBe('AVERAGE');
        });
        it('should update metrics correctly on recalculation', async () => {
            const farmerId = generateId();
            // Simulate changing from 10 completed orders to 50
            const previousMetrics = {
                completedOrdersCount: 10,
                totalOrdersCount: 10,
                averageRating: 4.0,
                totalReviewsCount: 10,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 90,
                averageResponseTimeHours: 24,
                kycLevel: 'BASIC',
                profileCompleteness: 50,
                lastActivityDate: new Date(),
            };
            const newMetrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 98,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const request = {
                farmerId,
                metrics: newMetrics,
            };
            const result = await trustScoreService.calculateAndStoreTrustScore(request);
            expect(result.trustScore.completedOrdersCount).toBe(50);
            expect(result.trustScore.totalOrdersCount).toBe(50);
            expect(result.trustScore.fulfillmentRate).toBe(98);
        });
    });
    describe('Score Categories', () => {
        it('should correctly categorize EXCELLENT score', async () => {
            const farmerId = generateId();
            const metrics = {
                completedOrdersCount: 100,
                totalOrdersCount: 100,
                averageRating: 4.9,
                totalReviewsCount: 100,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 100,
                averageResponseTimeHours: 1,
                kycLevel: 'ADVANCED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
            };
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const result = await trustScoreService.calculateAndStoreTrustScore(request);
            expect(result.trustScore.trustScoreCategory).toBe('EXCELLENT');
            expect(result.trustScore.trustScoreNumeric).toBeGreaterThanOrEqual(85);
        });
        it('should correctly categorize POOR score', async () => {
            const farmerId = generateId();
            const metrics = {
                completedOrdersCount: 10,
                totalOrdersCount: 100,
                averageRating: 1.5,
                totalReviewsCount: 50,
                disputeCount: 20,
                disputeResolutionRate: 0,
                cancellationCount: 30,
                cancellationRate: 30,
                fulfillmentRate: 20,
                averageResponseTimeHours: 240,
                kycLevel: 'NONE',
                profileCompleteness: 0,
                lastActivityDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            };
            const request = {
                farmerId,
                metrics,
            };
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const result = await trustScoreService.calculateAndStoreTrustScore(request);
            expect(result.trustScore.trustScoreCategory).toBe('POOR');
            expect(result.trustScore.trustScoreNumeric).toBeLessThan(30);
        });
    });
    describe('Change Tracking', () => {
        it('should track score changes over time', async () => {
            const farmerId = generateId();
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const metrics1 = {
                completedOrdersCount: 10,
                totalOrdersCount: 10,
                averageRating: 4.0,
                totalReviewsCount: 10,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 90,
                averageResponseTimeHours: 24,
                kycLevel: 'BASIC',
                profileCompleteness: 50,
                lastActivityDate: new Date(),
            };
            // First calculation
            const result1 = await trustScoreService.calculateAndStoreTrustScore({
                farmerId,
                metrics: metrics1,
            });
            const score1 = result1.trustScore.trustScoreNumeric;
            // Simulate improvement
            const metrics2 = {
                ...metrics1,
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.8,
                fulfillmentRate: 98,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
            };
            mockDb.query.mockResolvedValue({ rows: [] });
            mockRedis.get.mockResolvedValue(null);
            const result2 = await trustScoreService.calculateAndStoreTrustScore({
                farmerId,
                metrics: metrics2,
                changeReason: 'COMPLETED_ORDER',
            });
            const score2 = result2.trustScore.trustScoreNumeric;
            // Score should have improved
            expect(score2).toBeGreaterThan(score1);
            expect(result2.scoreChange).toBeGreaterThan(0);
        });
    });
    describe('Database Operations', () => {
        it('should use ON CONFLICT for upsert', async () => {
            const farmerId = generateId();
            mockDb.query.mockResolvedValue({ rows: [{ id: 1 }] });
            mockRedis.get.mockResolvedValue(null);
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 98,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
            };
            await trustScoreService.calculateAndStoreTrustScore(request);
            // Check that upsert query was used
            const queryCalls = mockDb.query.mock.calls;
            const upsertCall = queryCalls.find((call) => call[0].includes('ON CONFLICT') && call[0].includes('farmer_trust_scores'));
            expect(upsertCall).toBeDefined();
        });
        it('should store components separately', async () => {
            const farmerId = generateId();
            mockDb.query.mockResolvedValue({ rows: [{ id: 1 }] });
            mockRedis.get.mockResolvedValue(null);
            const metrics = {
                completedOrdersCount: 50,
                totalOrdersCount: 50,
                averageRating: 4.5,
                totalReviewsCount: 50,
                disputeCount: 0,
                disputeResolutionRate: 100,
                cancellationCount: 0,
                cancellationRate: 0,
                fulfillmentRate: 98,
                averageResponseTimeHours: 12,
                kycLevel: 'VERIFIED',
                profileCompleteness: 100,
                lastActivityDate: new Date(),
            };
            const request = {
                farmerId,
                metrics,
            };
            await trustScoreService.calculateAndStoreTrustScore(request);
            // Check that components were inserted
            const queryCalls = mockDb.query.mock.calls;
            const componentCalls = queryCalls.filter((call) => call[0].includes('farmer_trust_score_components'));
            expect(componentCalls.length).toBeGreaterThan(0);
        });
    });
});
