/**
 * Trust Score Engine Types
 * Complete type system for farmer trust scoring
 */

/**
 * Trust Score Categories
 * Ranges:
 * - EXCELLENT: 85-100
 * - GOOD: 70-84
 * - AVERAGE: 50-69
 * - BELOW_AVERAGE: 30-49
 * - POOR: 0-29
 */
export type TrustScoreCategory =
  | 'EXCELLENT'
  | 'GOOD'
  | 'AVERAGE'
  | 'BELOW_AVERAGE'
  | 'POOR';

export type TrustScoreChangeReason =
  | 'INITIAL_CALCULATION'
  | 'COMPLETED_ORDER'
  | 'NEW_REVIEW'
  | 'DISPUTE_CREATED'
  | 'DISPUTE_RESOLVED'
  | 'ORDER_CANCELLED'
  | 'KYC_IMPROVEMENT'
  | 'PROFILE_UPDATE'
  | 'TIME_DECAY'
  | 'FRAUD_DETECTED'
  | 'MANUAL_ADJUSTMENT'
  | 'RECALCULATION';

export type TrustScoreComponentType =
  | 'BASE_SCORE'
  | 'KYC_BONUS'
  | 'PROFILE_COMPLETENESS_BONUS'
  | 'DELIVERY_SUCCESS_BONUS'
  | 'RESPONSE_SPEED_BONUS'
  | 'DISPUTE_PENALTY'
  | 'CANCELLATION_PENALTY'
  | 'FRAUD_PENALTY'
  | 'TIME_DECAY_PENALTY';

export type KYCLevel = 'NONE' | 'BASIC' | 'VERIFIED' | 'ADVANCED';

export type ParameterCategory =
  | 'WEIGHT'
  | 'THRESHOLD'
  | 'BONUS'
  | 'PENALTY'
  | 'DECAY';

export type RecalculationReason =
  | 'NEW_ORDER_COMPLETED'
  | 'NEW_REVIEW_RECEIVED'
  | 'DISPUTE_STATUS_CHANGED'
  | 'KYC_LEVEL_UPGRADED'
  | 'PROFILE_UPDATED'
  | 'FRAUD_DETECTED'
  | 'PERIODIC_RECALCULATION'
  | 'MANUAL_TRIGGER'
  | 'QUEUE_RETRY';

export type RecalculationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Input metrics for trust score calculation
 */
export interface TrustScoreMetrics {
  completedOrdersCount: number;
  totalOrdersCount: number;
  averageRating: number | null;
  totalReviewsCount: number;
  disputeCount: number;
  disputeResolutionRate: number;
  cancellationCount: number;
  cancellationRate: number;
  fulfillmentRate: number;
  averageResponseTimeHours: number | null;
  kycLevel: KYCLevel;
  profileCompleteness: number | null;
  lastActivityDate: Date | null;
}

/**
 * Scoring parameters (weights, bonuses, penalties, thresholds)
 */
export interface TrustScoringParameter {
  parameterId: number;
  parameterName: string;
  parameterCategory: ParameterCategory;
  valueNumeric: number | null;
  valueText: string | null;
  valueJson: Record<string, any> | null;
  description: string;
  isActive: boolean;
  effectiveDate: Date;
}

/**
 * Configuration for scoring algorithm
 */
export interface TrustScoringConfig {
  weights: {
    completedOrders: number; // Weight for order completion rate
    averageRating: number; // Weight for customer rating
    fulfillmentRate: number; // Weight for fulfillment rate
    responseTime: number; // Weight for response speed bonus
    profileCompleteness: number; // Weight for profile completeness
    kycVerification: number; // Weight for KYC level
  };

  bonuses: {
    kycBasic: number; // Bonus for basic KYC
    kycVerified: number; // Bonus for verified KYC
    kycAdvanced: number; // Bonus for advanced KYC
    profileCompletenessMax: number; // Max bonus for 100% profile completeness
    deliverySuccessBonus: number; // Bonus per 10% delivery success > 90%
    responseTimeThresholdHours: number; // Threshold for response time bonus
    responseTimeBonusPoints: number; // Bonus for faster response time
  };

  penalties: {
    disputePerUnresolved: number; // Penalty per unresolved dispute
    disputeMaxPenalty: number; // Maximum dispute penalty
    cancellationPerCancellation: number; // Penalty per cancellation
    cancellationMaxPenalty: number; // Maximum cancellation penalty
    fraudSeverePenalty: number; // Penalty for fraud detection
  };

  decay: {
    ratePerMonth: number; // % decay per month of inactivity
    maxPenalty: number; // Maximum penalty from decay
    startMonths: number; // Months before decay starts
  };

  thresholds: {
    minOrdersForRating: number; // Min completed orders before rating impacts score
    excellentThreshold: number; // Score >= 85 = EXCELLENT
    goodThreshold: number; // Score >= 70 = GOOD
    averageThreshold: number; // Score >= 50 = AVERAGE
    belowAverageThreshold: number; // Score >= 30 = BELOW_AVERAGE
  };

  baseScore: number; // Starting score for all farmers
}

/**
 * Individual scoring component breakdown
 */
export interface TrustScoreComponent {
  componentId: number;
  farmerId: string;
  trustScoreId: number;
  componentName: TrustScoreComponentType;
  weightPercentage: number;
  basePoints: number;
  adjustmentPoints: number;
  finalPoints: number;
  adjustmentReason: string | null;
  supportingData: Record<string, any> | null;
}

/**
 * Trust score calculation breakdown
 */
export interface TrustScoreBreakdown {
  farmerId: string;
  baseScore: number;
  components: {
    name: TrustScoreComponentType;
    weight: number;
    basePoints: number;
    adjustmentPoints: number;
    finalPoints: number;
    reason?: string;
    explanation: string;
  }[];
  bonuses: {
    kycBonus: number;
    completionBonus: number;
    deliverySuccessBonus: number;
    responseSpeedBonus: number;
    totalBonuses: number;
  };
  penalties: {
    disputePenalty: number;
    cancellationPenalty: number;
    fraudPenalty: number;
    timDecayPenalty: number;
    totalPenalties: number;
  };
  finalScore: number;
  category: TrustScoreCategory;
  calculations: {
    completionRate: number;
    fulfillmentRate: number;
    avgResponse: number | null;
    kycLevel: KYCLevel;
    monthsInactive: number;
  };
}

/**
 * Current farmer trust score
 */
export interface FarmerTrustScore {
  farmerId: string;
  trustScoreNumeric: number;
  trustScoreCategory: TrustScoreCategory;

  // Component scores
  baseScore: number;
  kycBonus: number;
  completionBonus: number;
  deliverySuccessBonus: number;
  responseSpeedBonus: number;

  // Penalties
  disputePenalty: number;
  cancellationPenalty: number;
  fraudPenalty: number;
  timeDecayPenalty: number;

  // Metrics
  completedOrdersCount: number;
  totalOrdersCount: number;
  averageRating: number | null;
  totalReviewsCount: number;
  fulfillmentRate: number;
  averageResponseTimeHours: number | null;
  kycLevel: KYCLevel | null;
  profileCompleteness: number | null;
  disputeCount: number;
  cancellationCount: number;

  // Metadata
  calculatedAt: Date;
  recalculationTriggeredAt: Date | null;
  calculationMethod: 'WEIGHTED_ALGORITHM' | 'MANUAL' | 'RECALCULATED';
  dayssSinceActivity: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Trust score history entry
 */
export interface TrustScoreHistoryEntry {
  historyId: number;
  farmerId: string;
  previousScore: number;
  newScore: number;
  scoreChange: number;
  changeReason: TrustScoreChangeReason;
  metadata: Record<string, any> | null;
  relatedOrderId: string | null;
  relatedDisputeId: string | null;
  relatedReviewId: string | null;
  createdAt: Date;
}

/**
 * Request to calculate/recalculate trust score
 */
export interface TrustScoreCalculationRequest {
  farmerId: string;
  metrics: TrustScoreMetrics;
  changeReason?: TrustScoreChangeReason;
  relatedOrderId?: string;
  relatedDisputeId?: string;
  relatedReviewId?: string;
  metadata?: Record<string, any>;
}

/**
 * Response with trust score and breakdown
 */
export interface TrustScoreCalculationResponse {
  farmerId: string;
  trustScore: FarmerTrustScore;
  breakdown: TrustScoreBreakdown;
  history: TrustScoreHistoryEntry[];
  previousScore: number | null;
  scoreChange: number | null;
  cached: boolean;
  cacheExpiry: Date | null;
}

/**
 * Trust score API response
 */
export interface TrustScoreApiResponse {
  success: boolean;
  data?: {
    farmerId: string;
    trustScore: {
      value: number;
      category: TrustScoreCategory;
      percentile: number;
    };
    metrics: {
      completedOrders: number;
      totalOrders: number;
      averageRating: number | null;
      fulfillmentRate: number;
      responseTimeHours: number | null;
      kycLevel: KYCLevel | null;
    };
    breakdown: TrustScoreBreakdown;
    history: TrustScoreHistoryEntry[];
    recommendations: string[];
  };
  error?: string;
  message?: string;
}

/**
 * Recalculation job in queue
 */
export interface TrustScoreRecalculationJob {
  queueId: number;
  farmerId: string;
  status: RecalculationStatus;
  triggerReason: RecalculationReason;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  lastErrorMessage: string | null;
  scheduledAt: Date;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
}

/**
 * Batch recalculation request
 */
export interface BatchTrustScoreRecalculationRequest {
  triggerReason: RecalculationReason;
  farmerIds?: string[]; // Specific farmers, or null for all
  priorityRange?: {
    minPriority: number;
    maxPriority: number;
  };
  filters?: {
    trustScoreBelow?: number;
    trustScoreAbove?: number;
    inactiveForDays?: number;
    kycLevel?: KYCLevel;
  };
}

/**
 * Error type for trust score operations
 */
export class TrustScoreError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'TrustScoreError';
  }
}

/**
 * Caching configuration for trust scores
 */
export interface TrustScoreCacheConfig {
  ttlSeconds: number; // Time to live for cache
  invalidateOn: TrustScoreChangeReason[]; // Events that invalidate cache
  compressionEnabled: boolean;
}

/**
 * Summary statistics for trust scoring
 */
export interface TrustScoreSummaryStats {
  totalFarmers: number;
  avgTrustScore: number;
  medianTrustScore: number;
  distribution: {
    excellent: number;
    good: number;
    average: number;
    belowAverage: number;
    poor: number;
  };
  percentileRanks: {
    percentile50: number;
    percentile75: number;
    percentile90: number;
    percentile95: number;
  };
  recommendations: {
    needsKycUpgrade: string[];
    highDisputes: string[];
    inactiveChurn: string[];
  };
}
