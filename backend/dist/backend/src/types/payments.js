/**
 * Payment Pipeline Types - Production-grade financial system types
 * Ensures type safety for all payment, escrow, and settlement operations
 */
export class InsufficientFundsError extends Error {
    constructor(message) {
        super(message);
        this.code = 'INSUFFICIENT_FUNDS';
        this.name = 'InsufficientFundsError';
    }
}
export class IdempotencyError extends Error {
    constructor(message) {
        super(message);
        this.code = 'IDEMPOTENCY_ERROR';
        this.name = 'IdempotencyError';
    }
}
export class WebhookVerificationError extends Error {
    constructor(message) {
        super(message);
        this.code = 'WEBHOOK_VERIFICATION_FAILED';
        this.name = 'WebhookVerificationError';
    }
}
export class LedgerChainError extends Error {
    constructor(message) {
        super(message);
        this.code = 'LEDGER_CHAIN_BROKEN';
        this.name = 'LedgerChainError';
    }
}
