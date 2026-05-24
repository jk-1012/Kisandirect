import { createOfferService } from './offer-service';
describe('offer-service', () => {
    it('creates an offer and schedules expiry job', async () => {
        const queries = [];
        const fakeQueue = { add: jest.fn(() => Promise.resolve()) };
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT id, farmer_id, quantity_remaining_kg')) {
                        return Promise.resolve({ rows: [{ id: 1, farmer_id: 'farmer-1', quantity_remaining_kg: 500, status: 'ACTIVE', crop_type: 'TOMATO' }] });
                    }
                    if (text.includes('INSERT INTO public.offers')) {
                        return Promise.resolve({ rows: [{ id: 1 }] });
                    }
                    if (text.includes('SELECT phone FROM public.users WHERE id')) {
                        return Promise.resolve({ rows: [{ phone: '9999999999' }] });
                    }
                    return Promise.resolve({ rows: [] });
                })
            },
            queues: { listingQueue: fakeQueue },
            httpErrors: { notFound: () => new Error('not found'), badRequest: () => new Error('bad request'), forbidden: () => new Error('forbidden') },
            log: { warn: jest.fn(), error: jest.fn() }
        };
        const svc = createOfferService(fakeServer);
        const result = await svc.createOffer('buyer-1', 'LIST-1', 100, 22);
        expect(result).toHaveProperty('offer_id');
        expect(result.status).toBe('PENDING');
        expect(fakeQueue.add).toHaveBeenCalledWith('OFFER_EXPIRE', expect.any(Object), expect.any(Object));
    });
    it('farmer accepts offer and creates order', async () => {
        const queries = [];
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT * FROM public.offers WHERE offer_id')) {
                        return Promise.resolve({ rows: [{ id: 1, offer_id: 'OFF-1', farmer_id: 'farmer-1', buyer_id: 'buyer-1', listing_id: 10, quantity_kg: 100, offered_price_paise: 2200, status: 'PENDING' }] });
                    }
                    if (text.includes('SELECT id, is_premium, phone FROM public.users WHERE id')) {
                        return Promise.resolve({ rows: [{ id: 'buyer-1', is_premium: false, phone: '9999999999' }] });
                    }
                    if (text.includes('INSERT INTO public.orders')) {
                        return Promise.resolve({ rows: [{ id: 'order-1' }] });
                    }
                    if (text.includes('UPDATE public.offers SET status')) {
                        return Promise.resolve({ rows: [] });
                    }
                    if (text.includes('SELECT phone FROM public.users WHERE id')) {
                        return Promise.resolve({ rows: [{ phone: '9999999999' }] });
                    }
                    return Promise.resolve({ rows: [] });
                })
            },
            httpErrors: { notFound: () => new Error('not found'), badRequest: () => new Error('bad request'), forbidden: () => new Error('forbidden') },
            log: { warn: jest.fn(), error: jest.fn() }
        };
        const svc = createOfferService(fakeServer);
        const result = await svc.respondToOffer('farmer-1', 'OFF-1', 'ACCEPT');
        expect(result.status).toBe('ACCEPTED');
        expect(result).toHaveProperty('order');
        expect(queries.some((q) => q.text.includes('INSERT INTO public.orders'))).toBe(true);
    });
    it('farmer counters offer and resets expiry', async () => {
        const queries = [];
        const fakeQueue = { add: jest.fn(() => Promise.resolve()) };
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT * FROM public.offers WHERE offer_id')) {
                        return Promise.resolve({ rows: [{ id: 1, offer_id: 'OFF-1', farmer_id: 'farmer-1', buyer_id: 'buyer-1', quantity_kg: 100, offered_price_paise: 2200, status: 'PENDING' }] });
                    }
                    if (text.includes('UPDATE public.offers SET status')) {
                        return Promise.resolve({ rows: [] });
                    }
                    if (text.includes('SELECT phone FROM public.users WHERE id')) {
                        return Promise.resolve({ rows: [{ phone: '9999999999' }] });
                    }
                    return Promise.resolve({ rows: [] });
                })
            },
            queues: { listingQueue: fakeQueue },
            httpErrors: { notFound: () => new Error('not found'), badRequest: () => new Error('bad request'), forbidden: () => new Error('forbidden') },
            log: { warn: jest.fn(), error: jest.fn() }
        };
        const svc = createOfferService(fakeServer);
        const result = await svc.respondToOffer('farmer-1', 'OFF-1', 'COUNTER', { counter_price_per_kg_inr: 24 });
        expect(result.status).toBe('COUNTER_OFFERED');
        expect(fakeQueue.add).toHaveBeenCalled();
    });
    it('farmer declines offer and notifies buyer', async () => {
        const queries = [];
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT * FROM public.offers WHERE offer_id')) {
                        return Promise.resolve({ rows: [{ id: 1, offer_id: 'OFF-1', farmer_id: 'farmer-1', buyer_id: 'buyer-1', status: 'PENDING' }] });
                    }
                    if (text.includes('UPDATE public.offers SET status')) {
                        return Promise.resolve({ rows: [] });
                    }
                    if (text.includes('SELECT phone FROM public.users WHERE id')) {
                        return Promise.resolve({ rows: [{ phone: '9999999999' }] });
                    }
                    return Promise.resolve({ rows: [] });
                })
            },
            httpErrors: { notFound: () => new Error('not found'), badRequest: () => new Error('bad request'), forbidden: () => new Error('forbidden') },
            log: { warn: jest.fn(), error: jest.fn() }
        };
        const svc = createOfferService(fakeServer);
        const result = await svc.respondToOffer('farmer-1', 'OFF-1', 'DECLINE');
        expect(result.status).toBe('DECLINED');
    });
    it('expires old offer and notifies buyer', async () => {
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    if (text.includes('SELECT * FROM public.offers WHERE offer_id')) {
                        return Promise.resolve({ rows: [{ offer_id: 'OFF-1', buyer_id: 'buyer-1', status: 'PENDING' }] });
                    }
                    if (text.includes('UPDATE public.offers SET status')) {
                        return Promise.resolve({ rows: [] });
                    }
                    if (text.includes('SELECT phone FROM public.users')) {
                        return Promise.resolve({ rows: [{ phone: '9999999999' }] });
                    }
                    return Promise.resolve({ rows: [] });
                })
            },
            log: { warn: jest.fn(), error: jest.fn() }
        };
        const svc = createOfferService(fakeServer);
        const result = await svc.expireOfferHandler('OFF-1');
        expect(result.ok).toBe(true);
    });
});
