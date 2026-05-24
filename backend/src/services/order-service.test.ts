import { createOrderService } from './order-service';

describe('order-service', () => {
  it('creates an offer order and writes a ledger entry', async () => {
    const queries: Array<{ text: string; values: any[] }> = [];
    const fakeServer: any = {
      db: {
        query: jest.fn((text: string, values: any[]) => {
          queries.push({ text, values });
          if (text.includes('SELECT id, farmer_id')) {
            return Promise.resolve({ rows: [{ id: 'listing-uuid', farmer_id: 'farmer-uuid', quantity_remaining_kg: 150, status: 'ACTIVE' }] });
          }
          if (text.includes('INSERT INTO public.orders')) {
            return Promise.resolve({ rows: [{ id: 'order-db-uuid' }] });
          }
          if (text.includes('SELECT entry_hash FROM audit.transaction_ledger')) {
            return Promise.resolve({ rows: [{ entry_hash: 'prevhash' }] });
          }
          return Promise.resolve({ rows: [] });
        })
      },
      httpErrors: {
        notFound: () => new Error('not found'),
        badRequest: () => new Error('bad request'),
        internalServerError: () => new Error('internal error')
      },
      log: { error: jest.fn() },
      queues: { payoutQueue: { add: jest.fn() } }
    };

    const service = createOrderService(fakeServer as any);
    const result = await service.createOfferOrder('buyer-uuid', 'LIST-1', 20, 23);

    expect(result).toMatchObject({ order_id: expect.any(String), status: 'OFFER_MADE' });
    expect(queries.some((q) => q.text.includes('INSERT INTO public.orders'))).toBe(true);
    expect(queries.some((q) => q.text.includes('INSERT INTO audit.transaction_ledger'))).toBe(true);
  });

  it('creates a buy-now order and returns razorpay order data', async () => {
    const queries: Array<{ text: string; values: any[] }> = [];
    const fakeServer: any = {
      db: {
        query: jest.fn((text: string, values: any[]) => {
          queries.push({ text, values });
          if (text.includes('SELECT id, farmer_id')) {
            return Promise.resolve({ rows: [{ id: 'listing-uuid', farmer_id: 'farmer-uuid', quantity_remaining_kg: 150, status: 'ACTIVE', asking_price_paise: 5000, crop_type: 'TOMATO' }] });
          }
          if (text.includes('SELECT id, is_premium, phone')) {
            return Promise.resolve({ rows: [{ id: 'buyer-uuid', is_premium: false, phone: '9999999999' }] });
          }
          if (text.includes('INSERT INTO public.orders')) {
            return Promise.resolve({ rows: [{ id: 'order-db-uuid' }] });
          }
          if (text.includes('UPDATE public.orders SET razorpay_order_id')) {
            return Promise.resolve({ rows: [] });
          }
          if (text.includes('SELECT entry_hash FROM audit.transaction_ledger')) {
            return Promise.resolve({ rows: [{ entry_hash: 'prevhash' }] });
          }
          return Promise.resolve({ rows: [] });
        })
      },
      httpErrors: {
        notFound: () => new Error('not found'),
        badRequest: () => new Error('bad request'),
        internalServerError: () => new Error('internal error')
      },
      log: { error: jest.fn() },
      queues: { payoutQueue: { add: jest.fn() } }
    };

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'razorpay-order-id' }) });
    (global as any).fetch = fetchMock;
    process.env.RAZORPAY_KEY_ID = 'test-key';
    process.env.RAZORPAY_KEY_SECRET = 'test-secret';

    const service = createOrderService(fakeServer as any);
    const result = await service.createBuyNowOrder('buyer-uuid', 'LIST-1', 10, false);

    expect(result.order_id).toEqual(expect.any(String));
    expect(result.razorpay_order_id).toEqual('razorpay-order-id');
    expect(result.amount).toBe(51000);
    expect(queries.some((q) => q.text.includes('INSERT INTO public.orders'))).toBe(true);
    expect(queries.some((q) => q.text.includes('INSERT INTO audit.transaction_ledger'))).toBe(true);
    expect(fetchMock).toHaveBeenCalled();

    delete (global as any).fetch;
  });
});
