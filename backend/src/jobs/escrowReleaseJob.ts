import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

export const RELEASE_ESCROW = 'RELEASE_ESCROW';

export async function processReleaseEscrow(server: FastifyInstance, jobData: { orderId: string }) {
  const { orderId } = jobData;
  const res = await server.db.query(
    `SELECT o.*, fp.annual_payout_inr, fp.tds_deducted_inr, vk.bank_account_token
     FROM public.orders o
     LEFT JOIN public.farmer_profiles fp ON fp.user_id = o.farmer_id
     LEFT JOIN vault.farmer_kyc vk ON vk.farmer_id = o.farmer_id
     WHERE o.order_id = $1`,
    [orderId]
  );
  const order = res.rows[0];
  if (!order) {
    server.log.error({ orderId }, 'release escrow: order not found');
    return null;
  }

  if (order.order_status === 'RELEASED') {
    return { ok: true };
  }

  if (!['PAID', 'ESCROW_HELD'].includes(order.payment_status) || order.order_status !== 'DELIVERED') {
    server.log.warn({ orderId, payment_status: order.payment_status, order_status: order.order_status }, 'release escrow skipped until delivery is confirmed and payment is captured');
    return { ok: false, reason: 'payment not captured or delivery not confirmed' };
  }

  const annualPayoutInr = Number(order.annual_payout_inr ?? 0);
  const subtotalPaise = Number(order.subtotal_paise);
  const thresholdInr = Number(process.env.TDS_THRESHOLD_INR ?? 100000);
  const isAboveThreshold = annualPayoutInr >= thresholdInr || annualPayoutInr + Math.ceil(subtotalPaise / 100) > thresholdInr;
  const tdsPaise = isAboveThreshold ? Math.round(subtotalPaise * 0.02) : 0;
  const payoutPaise = subtotalPaise - tdsPaise;

  if (!order.bank_account_token) {
    server.log.error({ orderId, farmer_id: order.farmer_id }, 'farmer bank account missing, cannot release payout');
    return { ok: false, reason: 'farmer bank account not configured' };
  }

  const razorpayId = process.env.RAZORPAY_KEY_ID;
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpayId || !razorpaySecret) {
    server.log.error('Razorpay credentials missing');
    return { ok: false, reason: 'razorpay configuration missing' };
  }

  const payoutResponse = await fetch('https://api.razorpay.com/v1/payouts', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${razorpayId}:${razorpaySecret}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      account_number: order.bank_account_token,
      fund_account_id: order.bank_account_token,
      amount: payoutPaise,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      narration: `KisanDirect farmer payout for order ${orderId}`
    })
  });

  if (!payoutResponse.ok) {
    const errorText = await payoutResponse.text();
    server.log.error({ orderId, status: payoutResponse.status, body: errorText }, 'Razorpay payout failed');
    return { ok: false, reason: 'razorpay payout failed' };
  }

  const payoutJson = (await payoutResponse.json()) as any;
  const payoutId = payoutJson.id as string | undefined;

  await server.db.query(
    `UPDATE public.orders SET order_status = $1, escrow_release_at = NOW() WHERE order_id = $2`,
    ['RELEASED', orderId]
  );

  await server.db.query(
    `UPDATE public.farmer_profiles SET annual_payout_inr = COALESCE(annual_payout_inr,0) + $1, tds_deducted_inr = COALESCE(tds_deducted_inr,0) + $2 WHERE user_id = $3`,
    [Math.round(subtotalPaise / 100), Math.round(tdsPaise / 100), order.farmer_id]
  );

  const last = await server.db.query('SELECT entry_hash FROM audit.transaction_ledger ORDER BY created_at DESC LIMIT 1');
  const prevHash = last.rows[0]?.entry_hash ?? '';
  const now = new Date().toISOString();
  const entryHash = crypto.createHash('sha256').update(prevHash + JSON.stringify({ orderId, payoutPaise, tdsPaise, payoutId }) + now).digest('hex');

  await server.db.query(
    `INSERT INTO audit.transaction_ledger(txn_id, order_id, event_type, amount_paise, farmer_id, buyer_id, metadata, prev_hash, entry_hash, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
    [`TXN-${crypto.randomBytes(6).toString('hex')}`, order.id, 'ESCROW_RELEASED', payoutPaise, order.farmer_id, order.buyer_id, { payout_id: payoutId, tds_paise: tdsPaise }, prevHash, entryHash]
  );

  server.log.info({ orderId, payoutPaise, tdsPaise, payoutId }, 'escrow released to farmer');
  return { ok: true, payout_id: payoutId, tds_paise: tdsPaise };
}
