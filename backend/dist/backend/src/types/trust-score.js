/**
 * Trust Score Engine Types
 * Complete type system for farmer trust scoring
 */
/**
 * Error type for trust score operations
 */
export class TrustScoreError extends Error {
    constructor(message, code, statusCode = 500, retryable = false) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.retryable = retryable;
        this.name = 'TrustScoreError';
    }
}
