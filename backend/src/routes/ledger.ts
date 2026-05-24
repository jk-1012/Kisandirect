import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createLedgerService } from '../services/ledger-service.js';
import { createInvoiceService } from '../services/invoice-service.js';

export default async function (server: FastifyInstance) {
  const ledger = createLedgerService(server);
  const invoice = createInvoiceService(server);

  server.get('/transactions/:orderId/ledger', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };
    const orderRes = await server.db.query('SELECT * FROM public.orders WHERE order_id = $1', [orderId]);
    const order = orderRes.rows[0];
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    const userId = request.user.userId;
    if (String(order.farmer_id) !== String(userId) && request.user.role !== 'ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const rows = await server.db.query('SELECT txn_id, event_type, amount_paise, created_at, entry_hash, prev_hash FROM audit.transaction_ledger WHERE order_id = $1 ORDER BY id ASC', [order.id]);
    const entries = rows.rows.map((r: any) => ({ event_type: r.event_type, amount_inr: (Number(r.amount_paise) / 100).toFixed(2), timestamp: r.created_at, entry_hash: r.entry_hash, prev_hash: r.prev_hash }));
    const integrity = await ledger.verifyLedgerIntegrity();
    return reply.send({ order_id: orderId, entries, chain_valid: integrity.valid });
  });

  const querySchema = z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), from_date: z.string().optional(), to_date: z.string().optional() });

  server.get('/farmers/me/transactions', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const q = querySchema.parse(request.query as Record<string, unknown>);
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await server.db.query(
      `SELECT o.order_id, o.created_at, l.crop_type, fp.district AS buyer_district, o.quantity_kg, o.subtotal_paise, o.platform_fee_paise, o.order_status, o.payment_status
       FROM public.orders o
       LEFT JOIN public.listings l ON l.id = o.listing_id
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = o.buyer_id
       WHERE o.farmer_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const transactions = rows.rows.map((r: any) => ({ order_id: r.order_id, date: r.created_at, crop: r.crop_type, buyer_district: r.buyer_district, quantity_kg: Number(r.quantity_kg), gross_amount_inr: (Number(r.subtotal_paise) / 100).toFixed(2), platform_fee_inr: (Number(r.platform_fee_paise) / 100).toFixed(2), status: r.order_status }));

    const totalsRes = await server.db.query('SELECT COALESCE(SUM(subtotal_paise),0) AS total, COALESCE(SUM(platform_fee_paise),0) AS fees FROM public.orders WHERE farmer_id = $1', [userId]);
    const totals = totalsRes.rows[0];

    return reply.send({ transactions, total_earnings_inr: (Number(totals.total) / 100).toFixed(2), total_fees_inr: (Number(totals.fees) / 100).toFixed(2) });
  });

  server.get('/farmers/me/transactions/pdf', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    // For brevity generate a simple PDF containing a table of transactions
    // collect orders
    const rows = await server.db.query(`SELECT o.order_id, o.created_at, o.subtotal_paise FROM public.orders o WHERE o.farmer_id = $1 ORDER BY o.created_at DESC LIMIT 100`, [userId]);
    const lines = rows.rows.map((r: any) => `<tr><td>${r.order_id}</td><td>${new Date(r.created_at).toISOString().slice(0,10)}</td><td>₹${(Number(r.subtotal_paise)/100).toFixed(2)}</td></tr>`).join('');
    const html = `<html><body><h1>Transactions</h1><table><tr><th>Order</th><th>Date</th><th>Amount</th></tr>${lines}</table></body></html>`;
    const invoiceSvc = createInvoiceService(server);
    // reuse puppeteer generation
    const browser = await (await import('puppeteer')).launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="transactions-${userId}.pdf"`);
    return reply.send(pdf);
  });
}
