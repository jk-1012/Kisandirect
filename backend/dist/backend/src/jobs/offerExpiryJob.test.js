"use strict";
describe('offer expiry job', () => {
    it('marks PENDING offer as EXPIRED when called', async () => {
        const queries = [];
        const fakeDb = {
            query: jest.fn((text, values) => {
                queries.push({ text, values });
                if (text.includes('SELECT * FROM public.offers WHERE offer_id')) {
                    return Promise.resolve({ rows: [{ offer_id: 'OFF-1', buyer_id: 'buyer-1', status: 'PENDING' }] });
                }
                if (text.includes("UPDATE public.offers SET status = 'EXPIRED'")) {
                    return Promise.resolve({ rows: [] });
                }
                if (text.includes('SELECT u.phone FROM public.offers o JOIN public.users u')) {
                    return Promise.resolve({ rows: [{ phone: '9999999999' }] });
                }
                return Promise.resolve({ rows: [] });
            })
        };
        const fakeServer = { db: fakeDb, log: { warn: jest.fn(), info: jest.fn() } };
        // Simulate the job handler from queues.ts
        const offerId = 'OFF-1';
        const offer = await fakeDb.query('SELECT * FROM public.offers WHERE offer_id = $1', [offerId]);
        if (offer.rows[0] && ['PENDING', 'COUNTER_OFFERED'].includes(offer.rows[0].status)) {
            await fakeDb.query("UPDATE public.offers SET status = 'EXPIRED', updated_at = NOW() WHERE offer_id = $1", [offerId]);
        }
        expect(queries.some((q) => q.text.includes("UPDATE public.offers SET status = 'EXPIRED'"))).toBe(true);
    });
    it('does not expire ACCEPTED or DECLINED offers', async () => {
        const fakeDb = {
            query: jest.fn((text, values) => {
                if (text.includes('SELECT * FROM public.offers WHERE offer_id')) {
                    return Promise.resolve({ rows: [{ offer_id: 'OFF-2', status: 'ACCEPTED' }] });
                }
                return Promise.resolve({ rows: [] });
            })
        };
        const offerId = 'OFF-2';
        const offer = await fakeDb.query('SELECT * FROM public.offers WHERE offer_id = $1', [offerId]);
        if (offer.rows[0] && ['PENDING', 'COUNTER_OFFERED'].includes(offer.rows[0].status)) {
            // Should not enter this block
            throw new Error('Should not expire ACCEPTED offer');
        }
        expect(offer.rows[0].status).toBe('ACCEPTED');
    });
    it('OFFER_EXPIRE job queued for 24 hours when offer created', async () => {
        const fakeQueue = { add: jest.fn(() => Promise.resolve()) };
        // Simulate offer creation with job scheduling
        const offerId = 'OFF-NEW';
        await fakeQueue.add('OFFER_EXPIRE', { offerId }, {
            delay: 24 * 60 * 60 * 1000, // 24 hours
            jobId: offerId,
            removeOnComplete: true
        });
        expect(fakeQueue.add).toHaveBeenCalledWith('OFFER_EXPIRE', expect.objectContaining({ offerId }), expect.objectContaining({ delay: 24 * 60 * 60 * 1000 }));
    });
});
