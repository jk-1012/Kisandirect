import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { RELEASE_ESCROW, processReleaseEscrow } from '../jobs/escrowReleaseJob.js';
import { createTrustScoreService } from './trust-score-service.js';

export function createOrderService(server: FastifyInstance) {
  async function generateOrderId() {
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    return `ORD-${dateCode}-${digits}`;
  }

  async function sendWhatsAppMessage(phone: string, message: string) {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;
    if (!apiUrl || !token) {
      server.log.warn('WhatsApp configuration missing, message not sent');
      return;
    }

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: `91${phone}`, message })
      });
    } catch (err) {
      server.log.error({ err, phone, message }, 'Failed to send WhatsApp message');
    }
  }

  function computePlatformCommissionPercent(isPremium: boolean | null) {
    const std = Number(process.env.COMMISSION_STANDARD_PERCENT ?? 2);
    const prem = Number(process.env.COMMISSION_PREMIUM_PERCENT ?? 3);
    return isPremium ? prem : std;
  }

  async function createRazorpayOrder(orderId: string, amountPaise: number) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw server.httpErrors.internalServerError('Razorpay keys not configured');
    }

    const body = new URLSearchParams({
      amount: String(amountPaise),
      currency: 'INR',
      receipt: orderId,
      payment_capture: '1'
    });

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!res.ok) {
      const txt = await res.text();
      server.log.error({ status: res.status, body: txt }, 'razorpay order create failed');
      throw server.httpErrors.internalServerError('Failed to create razorpay order');
    }

    return await res.json();
  }

  async function writeLedgerEntry(entry: {
    event_type: string;
    order_id: string;
    amount_paise: number;
    farmer_id?: string;
    buyer_id?: string;
    metadata?: Record<string, any>;
  }) {
    const last = await server.db.query('SELECT entry_hash FROM audit.transaction_ledger ORDER BY created_at DESC LIMIT 1');
    const previousHash = last.rows[0]?.entry_hash ?? '';
    const now = new Date().toISOString();
    const entryHash = crypto.createHash('sha256').update(previousHash + JSON.stringify(entry) + now).digest('hex');
    await server.db.query(
      `INSERT INTO audit.transaction_ledger(txn_id, order_id, event_type, amount_paise, farmer_id, buyer_id, metadata, prev_hash, entry_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [`TXN-${crypto.randomBytes(6).toString('hex')}`, entry.order_id, entry.event_type, entry.amount_paise, entry.farmer_id ?? null, entry.buyer_id ?? null, entry.metadata ?? {}, previousHash, entryHash]
    );
    return entryHash;
  }

  async function createOfferOrder(buyerId: string, listingId: string, quantityKg: number, offerPricePerKgInr: number) {
    const listingRes = await server.db.query('SELECT id, farmer_id, quantity_remaining_kg, status FROM public.listings WHERE listing_id = $1 FOR UPDATE', [listingId]);
    const listing = listingRes.rows[0];
    if (!listing) throw server.httpErrors.notFound('Listing not found');
    if (listing.status !== 'ACTIVE') throw server.httpErrors.badRequest('Listing not active');
    if (Number(listing.quantity_remaining_kg) < quantityKg) throw server.httpErrors.badRequest('Insufficient quantity');

    const agreedPricePaise = Math.round(offerPricePerKgInr * 100);
    const subtotalPaise = Math.round(agreedPricePaise * quantityKg);

    const orderId = await generateOrderId();
    const insert = await server.db.query(
      `INSERT INTO public.orders (order_id, listing_id, farmer_id, buyer_id, quantity_kg, agreed_price_paise, subtotal_paise, platform_fee_paise, total_paise, payment_status, order_status, order_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING','OFFER_MADE','MAKE_OFFER') RETURNING id`,
      [orderId, listing.id, listing.farmer_id, buyerId, quantityKg, agreedPricePaise, subtotalPaise, 0, 0]
    );
    const insertedOrderId = insert.rows[0]?.id;

    await writeLedgerEntry({
      event_type: 'OFFER_CREATED',
      order_id: insertedOrderId,
      amount_paise: subtotalPaise,
      farmer_id: listing.farmer_id,
      buyer_id: buyerId,
      metadata: { offer_price_per_kg_inr: offerPricePerKgInr }
    });

    return { order_id: orderId, status: 'OFFER_MADE', subtotal_paise: subtotalPaise };
  }

  async function createRfqOrder(buyerId: string, listingId: string, quantityKg: number, message: string) {
    const listingRes = await server.db.query('SELECT id, farmer_id, quantity_remaining_kg, status FROM public.listings WHERE listing_id = $1', [listingId]);
    const listing = listingRes.rows[0];
    if (!listing) throw server.httpErrors.notFound('Listing not found');
    if (listing.status !== 'ACTIVE') throw server.httpErrors.badRequest('Listing not active');
    if (Number(listing.quantity_remaining_kg) < quantityKg) throw server.httpErrors.badRequest('Insufficient quantity');

    const orderId = await generateOrderId();
    const insert = await server.db.query(
      `INSERT INTO public.orders (order_id, listing_id, farmer_id, buyer_id, quantity_kg, agreed_price_paise, subtotal_paise, platform_fee_paise, total_paise, payment_status, order_status, order_type, request_details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING','RFQ_REQUESTED','RFQ',$10) RETURNING id`,
      [orderId, listing.id, listing.farmer_id, buyerId, quantityKg, 0, 0, 0, 0, message]
    );
    const insertedOrderId = insert.rows[0]?.id;

    await writeLedgerEntry({
      event_type: 'RFQ_CREATED',
      order_id: insertedOrderId,
      amount_paise: 0,
      farmer_id: listing.farmer_id,
      buyer_id: buyerId,
      metadata: { message }
    });

    return { order_id: orderId, status: 'RFQ_REQUESTED' };
  }

  async function createBuyNowOrder(buyerId: string, listingId: string, quantityKg: number, deliveryRequested = false, deliveryAddress?: string) {
    if (quantityKg < 1) {
      throw server.httpErrors.badRequest('Quantity must be at least 1 kg');
    }

    const listingRes = await server.db.query('SELECT id, farmer_id, quantity_remaining_kg, status, asking_price_paise, crop_type FROM public.listings WHERE listing_id = $1 FOR UPDATE', [listingId]);
    const listing = listingRes.rows[0];
    if (!listing) throw server.httpErrors.notFound('Listing not found');
    if (listing.status !== 'ACTIVE') throw server.httpErrors.badRequest('Listing not active');
    if (listing.farmer_id === buyerId) throw server.httpErrors.badRequest('Buyer cannot purchase their own listing');
    if (Number(listing.quantity_remaining_kg) < quantityKg) throw server.httpErrors.badRequest('Insufficient quantity');

    const buyerRes = await server.db.query('SELECT id, is_premium, phone FROM public.users WHERE id = $1', [buyerId]);
    const buyer = buyerRes.rows[0];
    if (!buyer) throw server.httpErrors.notFound('Buyer not found');

    const isPremium = buyer?.is_premium ?? false;
    const commissionPercent = computePlatformCommissionPercent(Boolean(isPremium));

    const agreedPricePaise = Number(listing.asking_price_paise);
    const subtotalPaise = Math.round(agreedPricePaise * quantityKg);
    const platformFeePaise = Math.round((subtotalPaise * commissionPercent) / 100);
    const totalPaise = subtotalPaise + platformFeePaise;

    const orderId = await generateOrderId();
    const requestDetails = deliveryRequested ? JSON.stringify({ delivery_requested: true, delivery_address: deliveryAddress ?? null }) : null;

    const insert = await server.db.query(
      `INSERT INTO public.orders (order_id, listing_id, farmer_id, buyer_id, quantity_kg, agreed_price_paise, subtotal_paise, platform_fee_paise, total_paise, request_details, payment_status, order_status, order_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING','PENDING','BUY_NOW') RETURNING *`,
      [orderId, listing.id, listing.farmer_id, buyerId, quantityKg, agreedPricePaise, subtotalPaise, platformFeePaise, totalPaise, requestDetails]
    );

    const razorpayOrder = (await createRazorpayOrder(orderId, totalPaise)) as any;
    await server.db.query('UPDATE public.orders SET razorpay_order_id = $1 WHERE order_id = $2', [razorpayOrder.id, orderId]);

    await writeLedgerEntry({
      event_type: 'ORDER_CREATED',
      order_id: insert.rows[0].id,
      amount_paise: totalPaise,
      farmer_id: listing.farmer_id,
      buyer_id: buyerId,
      metadata: { order_reference: orderId }
    });

    return {
      order_id: orderId,
      razorpay_order_id: razorpayOrder.id,
      razorpay_key_id: process.env.RAZORPAY_KEY_ID,
      amount: totalPaise,
      amount_paise: totalPaise,
      currency: 'INR',
      buyer_name: null,
      buyer_email: null,
      buyer_phone: buyer.phone
    };
  }

  async function handleRazorpayWebhook(body: any, signature?: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw server.httpErrors.internalServerError('Razorpay webhook secret not configured');
    }
    if (!signature) {
      throw server.httpErrors.badRequest('Missing razorpay signature');
    }

    const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    if (signature !== expected) {
      throw server.httpErrors.forbidden('Invalid webhook signature');
    }

    const event = body.event;
    const payload = body.payload?.payment?.entity ?? body.payload?.order?.entity ?? body.payload?.payment;
    const razorpayOrderId = payload?.order_id ?? payload?.receipt;
    if (!razorpayOrderId) {
      return null;
    }

    const ord = await server.db.query(
      `SELECT o.*, l.crop_type
       FROM public.orders o
       JOIN public.listings l ON l.id = o.listing_id
       WHERE o.razorpay_order_id = $1`,
      [razorpayOrderId]
    );
    const order = ord.rows[0];
    if (!order) {
      server.log.warn({ razorpay_order_id: razorpayOrderId }, 'Order not found for razorpay webhook');
      return null;
    }

    if (event === 'payment.captured') {
      const razorpayPaymentId = payload?.id;
      const amount = Number(payload?.amount);
      if (!razorpayPaymentId) {
        throw server.httpErrors.badRequest('Missing payment id');
      }
      if (amount !== Number(order.total_paise)) {
        throw server.httpErrors.badRequest('Payment amount mismatch');
      }

      await server.db.query('BEGIN');
      try {
        await server.db.query(
          `UPDATE public.orders SET payment_status = $1, order_status = $2, razorpay_payment_id = $3, escrow_release_at = NOW() + interval '48 hours' WHERE order_id = $4`,
          ['ESCROW_HELD', 'CONFIRMED', razorpayPaymentId, order.order_id]
        );

        await server.db.query(
          `UPDATE public.listings SET quantity_remaining_kg = quantity_remaining_kg - $1, status = CASE WHEN quantity_remaining_kg - $1 <= 0 THEN 'SOLD' ELSE status END WHERE id = $2`,
          [order.quantity_kg, order.listing_id]
        );

        await writeLedgerEntry({
          event_type: 'PAYMENT_RECEIVED',
          order_id: order.id,
          amount_paise: Number(order.subtotal_paise),
          farmer_id: order.farmer_id,
          buyer_id: order.buyer_id,
          metadata: { razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId }
        });

        await writeLedgerEntry({
          event_type: 'ESCROW_HELD',
          order_id: order.id,
          amount_paise: Number(order.total_paise),
          farmer_id: order.farmer_id,
          buyer_id: order.buyer_id,
          metadata: { razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId }
        });

        await server.queues.payoutQueue.add(RELEASE_ESCROW, { orderId: order.order_id }, {
          delay: 48 * 60 * 60 * 1000,
          jobId: order.order_id,
          removeOnComplete: true,
          removeOnFail: false
        });

        const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [order.buyer_id]);
        const farmer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [order.farmer_id]);
        const buyerPhone = buyer.rows[0]?.phone;
        const farmerPhone = farmer.rows[0]?.phone;

        if (farmerPhone) {
          await sendWhatsAppMessage(
            farmerPhone,
            `New order! ${order.quantity_kg}kg of ${order.crop_type ?? 'crop'} from buyer. ₹${(Number(order.total_paise) / 100).toFixed(2)} is now in escrow.`
          );
        }
        if (buyerPhone) {
          await sendWhatsAppMessage(buyerPhone, `Order confirmed! Farmer will prepare your order ${order.order_id}.`);
        }

        await server.db.query('COMMIT');
      } catch (err) {
        await server.db.query('ROLLBACK');
        throw err;
      }

      return { received: true };
    }

    if (event === 'payment.failed') {
      const razorpayPaymentId = payload?.id;
      await server.db.query('UPDATE public.orders SET payment_status = $1, order_status = $2 WHERE order_id = $3', ['FAILED', 'CANCELLED', order.order_id]);

      const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [order.buyer_id]);
      const buyerPhone = buyer.rows[0]?.phone;
      if (buyerPhone) {
        await sendWhatsAppMessage(buyerPhone, `Payment failed for order ${order.order_id}. Please try again or contact support.`);
      }

      return { received: true };
    }

    return null;
  }

  async function sendDeliveryOtp(userId: string, orderId: string) {
    const orderRes = await server.db.query(
      `SELECT o.order_id, o.order_status, u.phone AS farmer_phone, u.language AS farmer_language, o.buyer_id
       FROM public.orders o
       JOIN public.users u ON o.farmer_id = u.id
       WHERE o.order_id = $1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) throw server.httpErrors.notFound('Order not found');
    if (order.buyer_id !== userId) throw server.httpErrors.forbidden('Not authorized');
    if (!['CONFIRMED', 'DISPATCHED'].includes(order.order_status)) {
      throw server.httpErrors.badRequest('Order must be confirmed or dispatched before sending delivery OTP');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await server.db.query(
      `INSERT INTO public.otp_sessions (phone, otp_hash, attempts, expires_at, used, created_at)
       VALUES ($1,$2,0,NOW() + interval '10 minutes', FALSE,NOW())`,
      [order.farmer_phone, otpHash]
    );

    await sendWhatsAppMessage(order.farmer_phone, `Your delivery confirmation code is ${otp}. Please share it with the buyer.`);
    await server.db.query('UPDATE public.orders SET order_status = $1 WHERE order_id = $2', ['DELIVERY_OTP_SENT', orderId]);

    return { message: 'OTP sent to farmer. Ask farmer for the code.' };
  }

  async function verifyDeliveryOtp(userId: string, orderId: string, otp: string) {
    const orderRes = await server.db.query(
      `SELECT o.id, o.order_id, o.order_status, o.payment_status, o.farmer_id, o.buyer_id
       FROM public.orders o
       WHERE o.order_id = $1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) throw server.httpErrors.notFound('Order not found');
    if (order.buyer_id !== userId) throw server.httpErrors.forbidden('Not authorized');
    if (order.order_status !== 'DELIVERY_OTP_SENT') {
      throw server.httpErrors.badRequest('No delivery OTP has been sent for this order');
    }

    const otpSessionRes = await server.db.query(
      'SELECT * FROM public.otp_sessions WHERE phone = (SELECT phone FROM public.users WHERE id = $1) AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [order.farmer_id]
    );
    const session = otpSessionRes.rows[0];
    if (!session) throw server.httpErrors.unauthorized('Invalid or expired OTP');

    const matches = await bcrypt.compare(otp, session.otp_hash);
    if (!matches) {
      await server.db.query('UPDATE public.otp_sessions SET attempts = attempts + 1 WHERE id = $1', [session.id]);
      throw server.httpErrors.unauthorized('Invalid OTP');
    }

    await server.db.query('UPDATE public.otp_sessions SET used = TRUE, attempts = attempts + 1 WHERE id = $1', [session.id]);
    await server.db.query('UPDATE public.orders SET order_status = $1, delivery_confirmed_at = NOW() WHERE order_id = $2', ['DELIVERED', orderId]);
    await server.queues.payoutQueue.remove(orderId);

    await createTrustScoreService(server).recalculateFarmerTrustScore(order.farmer_id);

    const result = await processReleaseEscrow(server, { orderId });
    if (!result?.ok) {
      server.log.warn({ orderId, result }, 'Immediate escrow release failed');
    }

    return { success: true, message: 'Delivery confirmed. Farmer payout initiated.' };
  }

  return {
    createBuyNowOrder,
    createOfferOrder,
    createRfqOrder,
    handleRazorpayWebhook,
    sendDeliveryOtp,
    verifyDeliveryOtp
  };
}
