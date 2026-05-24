import { createRfqService } from './rfq-service';
describe('rfq-service', () => {
    it('creates an RFQ and notifies matched farmers', async () => {
        const queries = [];
        const fakeEs = {
            search: jest.fn(() => Promise.resolve({ hits: { hits: [] } }))
        };
        const fakeServer = {
            db: {
                query: jest.fn((text, values) => {
                    queries.push({ text, values });
                    if (text.includes('SELECT id, is_institutional'))
                        return Promise.resolve({ rows: [{ id: 'buyer-1', is_institutional: true }] });
                    if (text.includes('INSERT INTO public.rfqs'))
                        return Promise.resolve({ rows: [{ id: 123 }] });
                    if (text.includes('SELECT u.id'))
                        return Promise.resolve({ rows: [{ id: 'farmer-1', phone: '9999999999' }] });
                    return Promise.resolve({ rows: [] });
                })
            },
            storage: { searchClient: fakeEs, listingIndexName: 'listings' },
            log: { warn: jest.fn(), info: jest.fn() }
        };
        const svc = createRfqService(fakeServer);
        const result = await svc.createRfq('buyer-1', {
            crop_type: 'TOMATO',
            quantity_mt: 2.5,
            price_ceiling_inr_per_kg: 25.0,
            delivery_date: '2026-06-15',
            delivery_district: 'Hassan',
            delivery_state_code: 'KA',
            quality_requirements: 'Grade A'
        });
        expect(result).toHaveProperty('rfq_id');
        expect(result).toHaveProperty('matched_farmers_count');
        expect(queries.some((q) => q.text.includes('INSERT INTO public.rfqs'))).toBe(true);
    });
    it('allows farmer to submit a quote and notifies buyer', async () => {
        const queries = [];
        const fakeServer = {
            db: { query: jest.fn((text, values) => { queries.push({ text, values }); if (text.includes('SELECT * FROM public.rfqs'))
                    return Promise.resolve({ rows: [{ id: 10, rfq_id: 'RFQ-1', buyer_id: 'buyer-1', expires_at: new Date(Date.now() + 10000).toISOString() }] }); if (text.includes('SELECT id FROM public.users WHERE id'))
                    return Promise.resolve({ rows: [{ id: 'farmer-1' }] }); if (text.includes('INSERT INTO public.rfq_quotes'))
                    return Promise.resolve({ rows: [{ id: 1 }] }); if (text.includes('SELECT phone FROM public.users WHERE id ='))
                    return Promise.resolve({ rows: [{ phone: '9999999999' }] }); return Promise.resolve({ rows: [] }); }) },
            log: { warn: jest.fn() }
        };
        const svc = createRfqService(fakeServer);
        const res = await svc.submitQuote('farmer-1', 'RFQ-1', { quantity_kg: 1500, price_per_kg_inr: 23.5, available_from_date: '2026-06-10', notes: 'Available at farm gate' });
        expect(res).toHaveProperty('quote_id');
        expect(queries.some((q) => q.text.includes('INSERT INTO public.rfq_quotes'))).toBe(true);
    });
});
