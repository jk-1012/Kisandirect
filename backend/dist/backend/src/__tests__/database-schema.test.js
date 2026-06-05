import { Pool } from 'pg';
describe('Database schema repair validation', () => {
    const pool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5433/kisandirect_test'
    });
    let client;
    beforeAll(async () => {
        client = await pool.connect();
    });
    afterAll(async () => {
        await client.release();
        await pool.end();
    });
    test('notifications table contains production fields and indexes', async () => {
        const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications'`);
        const columns = res.rows.map((row) => row.column_name);
        expect(columns).toEqual(expect.arrayContaining([
            'user_id',
            'type',
            'title',
            'body',
            'channel',
            'status',
            'is_read',
            'delivered_at',
            'read_at',
            'sent_at'
        ]));
    });
    test('price_alerts table uses farmer_id and threshold_price_per_kg_inr', async () => {
        const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'price_alerts'`);
        const columns = res.rows.map((row) => row.column_name);
        expect(columns).toEqual(expect.arrayContaining([
            'farmer_id',
            'crop_type',
            'state_code',
            'direction',
            'threshold_price_per_kg_inr',
            'active'
        ]));
    });
    test('missing SRS tables were created', async () => {
        const expectedTables = [
            'buyer_subscriptions',
            'supply_forecasts',
            'order_modifications',
            'logistics_providers',
            'cold_storage_temperature_logs'
        ];
        const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`, [expectedTables]);
        const existing = res.rows.map((row) => row.table_name);
        expect(existing.sort()).toEqual(expectedTables.sort());
    });
    test('primary lookup indexes exist for listings and orders', async () => {
        const res = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`, [[
                'idx_listings_state_crop',
                'idx_listings_status_expires',
                'idx_orders_razorpay_order_id'
            ]]);
        const indexes = res.rows.map((row) => row.indexname);
        expect(indexes).toEqual(expect.arrayContaining([
            'idx_listings_state_crop',
            'idx_listings_status_expires',
            'idx_orders_razorpay_order_id'
        ]));
    });
});
