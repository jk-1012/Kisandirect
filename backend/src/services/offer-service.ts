import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

export function createOfferService(server: FastifyInstance) {
  async function generateOfferId() {
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    return `OFF-${dateCode}-${digits}`;
  }

  async function sendWhatsAppMessage(phone: string, message: string) {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;
    if (!apiUrl || !token) return;
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
      server.log.error({ err, phone }, 'failed to send whatsapp');
    }
  }

  async function createOffer(buyerId: string, listingId: string, quantityKg: number, offerPricePerKgInr: number) {
    const listingRes = await server.db.query('SELECT id, farmer_id, quantity_remaining_kg, status, crop_type FROM public.listings WHERE listing_id = $1 FOR UPDATE', [listingId]);
    const listing = listingRes.rows[0];
    if (!listing) throw server.httpErrors.notFound('Listing not found');
    if (listing.status !== 'ACTIVE') throw server.httpErrors.badRequest('Listing not active');
    if (Number(listing.quantity_remaining_kg) < quantityKg) throw server.httpErrors.badRequest('Insufficient quantity');

    const offerId = await generateOfferId();
    const offeredPaise = Math.round(offerPricePerKgInr * 100);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await server.db.query(
      `INSERT INTO public.offers (offer_id, listing_id, buyer_id, farmer_id, quantity_kg, offered_price_paise, status, expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,NOW(),NOW())`,
      [offerId, listing.id, buyerId, listing.farmer_id, quantityKg, offeredPaise, expiresAt]
    );

    try {
      await server.queues.listingQueue.add('OFFER_EXPIRE', { offerId }, { delay: 24 * 60 * 60 * 1000, jobId: offerId, removeOnComplete: true });
    } catch (err) {
      server.log.warn({ err, offerId }, 'scheduling offer expire job failed');
    }

    // notify farmer
    const farmer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [listing.farmer_id]);
    const farmerPhone = farmer.rows[0]?.phone;
    if (farmerPhone) {
      await sendWhatsAppMessage(farmerPhone, `You have a new offer ${offerId} for ${quantityKg}kg of ${listing.crop_type} at ₹${offerPricePerKgInr.toFixed(2)}/kg. Reply in the app to Accept/Counter/Decline.`);
    }

    return { offer_id: offerId, status: 'PENDING', expires_at: expiresAt };
  }

  async function createOrderFromOffer(offerRow: any) {
    // insert an order linked to this offer; buyer will be asked to pay via razorpay order
    const buyerRes = await server.db.query('SELECT id, is_premium, phone FROM public.users WHERE id = $1', [offerRow.buyer_id]);
    const buyer = buyerRes.rows[0];
    if (!buyer) throw server.httpErrors.notFound('Buyer not found');

    const commissionPercent = Number(process.env.COMMISSION_STANDARD_PERCENT ?? 2);
    const agreedPricePaise = Number(offerRow.offered_price_paise);
    const subtotalPaise = Math.round(Number(offerRow.quantity_kg) * agreedPricePaise);
    const platformFeePaise = Math.round((subtotalPaise * commissionPercent) / 100);
    const totalPaise = subtotalPaise + platformFeePaise;

    const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100000 + Math.random() * 900000)}`;

    const insert = await server.db.query(
      `INSERT INTO public.orders (order_id, listing_id, farmer_id, buyer_id, quantity_kg, agreed_price_paise, subtotal_paise, platform_fee_paise, total_paise, payment_status, order_status, order_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING','PENDING','MAKE_OFFER') RETURNING *`,
      [orderId, offerRow.listing_id, offerRow.farmer_id, offerRow.buyer_id, offerRow.quantity_kg, agreedPricePaise, subtotalPaise, platformFeePaise, totalPaise]
    );

    const razorpayOrder: any = await (async () => {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        server.log.warn('Razorpay not configured for createOrderFromOffer');
        return null;
      }
      const body = new URLSearchParams({ amount: String(totalPaise), currency: 'INR', receipt: orderId, payment_capture: '1' });
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (!res.ok) {
        const txt = await res.text();
        server.log.error({ status: res.status, body: txt }, 'razorpay order create failed for offer');
        return null;
      }
      return await res.json();
    })();

    if (razorpayOrder && razorpayOrder.id) {
      await server.db.query('UPDATE public.orders SET razorpay_order_id = $1 WHERE order_id = $2', [razorpayOrder.id, orderId]);
    }

    return { order_id: orderId, razorpay_order_id: razorpayOrder?.id ?? null, amount_paise: totalPaise };
  }

  async function respondToOffer(farmerId: string, offerId: string, action: 'ACCEPT' | 'COUNTER' | 'DECLINE', opts?: { counter_price_per_kg_inr?: number; counter_message?: string }) {
    const offerRes = await server.db.query('SELECT * FROM public.offers WHERE offer_id = $1', [offerId]);
    const offer = offerRes.rows[0];
    if (!offer) throw server.httpErrors.notFound('Offer not found');
    if (String(offer.farmer_id) !== String(farmerId)) throw server.httpErrors.forbidden('Not authorized');
    if (!['PENDING', 'COUNTER_OFFERED'].includes(offer.status)) throw server.httpErrors.badRequest('Offer cannot be acted upon');

    if (action === 'ACCEPT') {
      // create order row and razorpay order for buyer to pay
      const order = await createOrderFromOffer(offer);
      await server.db.query('UPDATE public.offers SET status = $1, order_id = $2, updated_at = NOW() WHERE offer_id = $3', ['ACCEPTED', order.order_id, offerId]);

      // notify buyer
      const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [offer.buyer_id]);
      const buyerPhone = buyer.rows[0]?.phone;
      if (buyerPhone) {
        await sendWhatsAppMessage(buyerPhone, `Your offer ${offerId} was accepted. Pay to complete order: order ${order.order_id}.`);
      }

      return { status: 'ACCEPTED', order };
    }

    if (action === 'COUNTER') {
      if (!opts?.counter_price_per_kg_inr) throw server.httpErrors.badRequest('counter_price_per_kg_inr required for counter');
      const counterPaise = Math.round(opts.counter_price_per_kg_inr * 100);
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await server.db.query('UPDATE public.offers SET status = $1, counter_price_paise = $2, expires_at = $3, updated_at = NOW() WHERE offer_id = $4', ['COUNTER_OFFERED', counterPaise, newExpires, offerId]);

      try {
        await server.queues.listingQueue.add('OFFER_EXPIRE', { offerId }, { delay: 24 * 60 * 60 * 1000, jobId: `${offerId}:${Date.now()}`, removeOnComplete: true });
      } catch (err) {
        server.log.warn({ err, offerId }, 'scheduling offer expire for counter failed');
      }

      // notify buyer
      const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [offer.buyer_id]);
      const buyerPhone = buyer.rows[0]?.phone;
      if (buyerPhone) {
        await sendWhatsAppMessage(buyerPhone, `Farmer countered your offer ${offerId} with ₹${opts!.counter_price_per_kg_inr!.toFixed(2)}/kg. Reply in app to accept or counter.`);
      }

      return { status: 'COUNTER_OFFERED', counter_price_paise: counterPaise, expires_at: newExpires };
    }

    if (action === 'DECLINE') {
      await server.db.query('UPDATE public.offers SET status = $1, updated_at = NOW() WHERE offer_id = $2', ['DECLINED', offerId]);
      const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [offer.buyer_id]);
      const buyerPhone = buyer.rows[0]?.phone;
      if (buyerPhone) {
        await sendWhatsAppMessage(buyerPhone, `Your offer ${offerId} was declined by the farmer.`);
      }
      return { status: 'DECLINED' };
    }

    throw server.httpErrors.badRequest('Unknown action');
  }

  async function expireOfferHandler(offerId: string) {
    const res = await server.db.query('SELECT * FROM public.offers WHERE offer_id = $1', [offerId]);
    const offer = res.rows[0];
    if (!offer) return { ok: false, reason: 'not_found' };
    if (['PENDING', 'COUNTER_OFFERED'].includes(offer.status)) {
      await server.db.query('UPDATE public.offers SET status = $1, updated_at = NOW() WHERE offer_id = $2', ['EXPIRED', offerId]);
      const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [offer.buyer_id]);
      const buyerPhone = buyer.rows[0]?.phone;
      if (buyerPhone) {
        await sendWhatsAppMessage(buyerPhone, `Your offer ${offerId} has expired.`);
      }
      return { ok: true, expired: true };
    }
    return { ok: true, expired: false };
  }

  return { createOffer, respondToOffer, expireOfferHandler };
}

export type OfferService = ReturnType<typeof createOfferService>;
