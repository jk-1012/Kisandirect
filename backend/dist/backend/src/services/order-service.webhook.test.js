import { createOrderService } from './order-service';
import crypto from 'crypto';
describe('order-service webhook idempotency', () => {
    it('ignores duplicate payment.captured webhooks', async () => {
        const queries = [];
        let selectOrderCalled = 0;
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT o.*, l.crop_type')) {
                        selectOrderCalled += 1;
                        // First time: payment not yet captured. Second time: already ESCROW_HELD
                        if (selectOrderCalled === 1) {
                            return Promise.resolve({ rows: [{ order_id: 'ORD-1', id: 1, total_paise: 100000, subtotal_paise: 80000, quantity_kg: 8, listing_id: 10, farmer_id: 'F1', buyer_id: 'B1', payment_status: 'PENDING', order_status: 'PENDING', razorpay_order_id: 'r_order_1' }] });
                        }
                        return Promise.resolve({ rows: [{ order_id: 'ORD-1', id: 1, total_paise: 100000, subtotal_paise: 80000, quantity_kg: 8, listing_id: 10, farmer_id: 'F1', buyer_id: 'B1', payment_status: 'ESCROW_HELD', order_status: 'CONFIRMED', razorpay_order_id: 'r_order_1', razorpay_payment_id: 'pay_1' }] });
                    }
                    if (text.includes('SELECT entry_hash FROM audit.transaction_ledger')) {
                        return Promise.resolve({ rows: [{ entry_hash: 'prev-hash' }] });
                    }
                    // Return empty by default
                    return Promise.resolve({ rows: [] });
                })
            },
            log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
            queues: { payoutQueue: { add: jest.fn() } }
        };
        process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
        const service = createOrderService(fakeServer);
        const body = { event: 'payment.captured', payload: { payment: { id: 'pay_1', order_id: 'r_order_1', amount: 100000 } } };
        const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex');
        // First delivery should process and write ledger entries (2 inserts)
        const res1 = await service.handleRazorpayWebhook(body, sig);
        expect(res1).toEqual({ received: true });
        // Clear non-insert queries tracking; keep ledger inserts count
        const ledgerInsertsAfterFirst = queries.filter(q => q.text && q.text.includes('INSERT INTO audit.transaction_ledger')).length;
        expect(ledgerInsertsAfterFirst).toBeGreaterThanOrEqual(2);
        // Second delivery (replay) should be ignored as idempotent
        const res2 = await service.handleRazorpayWebhook(body, sig);
        expect(res2).toEqual({ received: true });
        const totalLedgerInserts = queries.filter(q => q.text && q.text.includes('INSERT INTO audit.transaction_ledger')).length;
        // Ensure no additional ledger inserts were created by the replay
        expect(totalLedgerInserts).toBe(ledgerInsertsAfterFirst);
    });
});
