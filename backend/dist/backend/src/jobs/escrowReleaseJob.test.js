import { processReleaseEscrow } from './escrowReleaseJob';
describe('escrowReleaseJob', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RAZORPAY_KEY_ID = 'test-key-id';
        process.env.RAZORPAY_KEY_SECRET = 'test-key-secret';
    });
    it('skips release if order not found', async () => {
        const fakeServer = {
            db: {
                query: jest.fn(() => Promise.resolve({ rows: [] }))
            },
            log: { error: jest.fn(), warn: jest.fn() }
        };
        const result = await processReleaseEscrow(fakeServer, { orderId: 'NOT-FOUND' });
        expect(result).toBeNull();
        expect(fakeServer.log.error).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'NOT-FOUND' }), expect.any(String));
    });
    it('skips release if order already released', async () => {
        const fakeServer = {
            db: {
                query: jest.fn(() => Promise.resolve({
                    rows: [{
                            order_id: 'ORD-RELEASED',
                            order_status: 'RELEASED'
                        }]
                }))
            },
            log: { error: jest.fn(), warn: jest.fn() }
        };
        const result = await processReleaseEscrow(fakeServer, { orderId: 'ORD-RELEASED' });
        expect(result?.ok).toBe(true);
    });
    it('rejects release if payment not captured or delivery not confirmed', async () => {
        const fakeServer = {
            db: {
                query: jest.fn(() => Promise.resolve({
                    rows: [{
                            order_id: 'ORD-PENDING',
                            payment_status: 'PENDING',
                            order_status: 'PENDING'
                        }]
                }))
            },
            log: { error: jest.fn(), warn: jest.fn() }
        };
        const result = await processReleaseEscrow(fakeServer, { orderId: 'ORD-PENDING' });
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('payment not captured or delivery not confirmed');
    });
    it('rejects release if farmer bank account not configured', async () => {
        const fakeServer = {
            db: {
                query: jest.fn(() => Promise.resolve({
                    rows: [{
                            order_id: 'ORD-NO-ACCOUNT',
                            payment_status: 'ESCROW_HELD',
                            order_status: 'DELIVERED',
                            bank_account_token: null,
                            farmer_id: 'farmer-1'
                        }]
                }))
            },
            log: { error: jest.fn(), warn: jest.fn() }
        };
        const result = await processReleaseEscrow(fakeServer, { orderId: 'ORD-NO-ACCOUNT' });
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('farmer bank account not configured');
    });
    it('rejects release if razorpay credentials missing', async () => {
        delete process.env.RAZORPAY_KEY_ID;
        delete process.env.RAZORPAY_KEY_SECRET;
        const fakeServer = {
            db: {
                query: jest.fn(() => Promise.resolve({
                    rows: [{
                            order_id: 'ORD-NO-CREDS',
                            payment_status: 'ESCROW_HELD',
                            order_status: 'DELIVERED',
                            bank_account_token: 'token-123',
                            farmer_id: 'farmer-1'
                        }]
                }))
            },
            log: { error: jest.fn(), warn: jest.fn() }
        };
        const result = await processReleaseEscrow(fakeServer, { orderId: 'ORD-NO-CREDS' });
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('razorpay configuration missing');
    });
    it('writes ledger entry on successful release', async () => {
        const queries = [];
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT o.*')) {
                        return Promise.resolve({
                            rows: [{
                                    order_id: 'ORD-SUCCESS',
                                    id: 1,
                                    payment_status: 'ESCROW_HELD',
                                    order_status: 'DELIVERED',
                                    bank_account_token: 'token-123',
                                    farmer_id: 'farmer-1',
                                    buyer_id: 'buyer-1',
                                    subtotal_paise: 100000,
                                    annual_payout_inr: 50000
                                }]
                        });
                    }
                    if (text.includes('SELECT entry_hash FROM audit.transaction_ledger')) {
                        return Promise.resolve({ rows: [{ entry_hash: 'prev-hash' }] });
                    }
                    return Promise.resolve({ rows: [] });
                })
            },
            log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
        };
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'payout-123' })
        }));
        const result = await processReleaseEscrow(fakeServer, { orderId: 'ORD-SUCCESS' });
        expect(result?.ok).toBe(true);
        expect(queries.some((q) => q.text.includes('INSERT INTO audit.transaction_ledger'))).toBe(true);
    });
});
