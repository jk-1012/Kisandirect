import crypto from 'crypto';
export function createPaymentService(server) {
    /**
     * Create Razorpay order and store in database
     * Funds are held in escrow until delivery confirmation
     */
    async function createOrder(payload) {
        // Validate listing and farmer
        const listingRes = await server.db.query('SELECT * FROM public.listings WHERE id = $1 AND status = $2', [payload.listing_id, 'ACTIVE']);
        if (!listingRes.rows[0]) {
            throw server.httpErrors.notFound('Listing not found or no longer active');
        }
        const listing = listingRes.rows[0];
        const farmer = await server.db.query('SELECT id FROM public.users WHERE id = $1 AND role = $2', [listing.farmer_id, 'FARMER']);
        if (!farmer.rows[0]) {
            throw server.httpErrors.notFound('Farmer not found');
        }
        // Calculate totals
        const subtotalPaise = Math.round(payload.quantity_kg * payload.price_per_kg_inr * 100);
        const commissionPercentage = 2; // Standard commission (can be 3 for premium)
        const commissionPaise = Math.round(subtotalPaise * (commissionPercentage / 100));
        const totalPaise = subtotalPaise + commissionPaise;
        // Create Razorpay order
        const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: totalPaise,
                currency: 'INR',
                receipt: `order-${Date.now()}`,
                notes: {
                    listing_id: payload.listing_id,
                    buyer_id: payload.buyer_id,
                    farmer_id: listing.farmer_id
                }
            })
        });
        if (!razorpayResponse.ok) {
            server.log.error({ status: razorpayResponse.status }, 'Razorpay order creation failed');
            throw server.httpErrors.badGateway('Payment gateway unavailable');
        }
        const razorpayOrder = (await razorpayResponse.json());
        // Store order in database
        const orderRes = await server.db.query(`INSERT INTO public.orders
       (order_id, listing_id, farmer_id, buyer_id, quantity_kg, agreed_price_paise, subtotal_paise, 
        commission_paise, total_paise, razorpay_order_id, payment_status, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
       RETURNING id, order_id`, [
            `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            payload.listing_id,
            listing.farmer_id,
            payload.buyer_id,
            payload.quantity_kg,
            Math.round(payload.price_per_kg_inr * 100),
            subtotalPaise,
            commissionPaise,
            totalPaise,
            razorpayOrder.id,
            'PENDING',
            'PENDING_PAYMENT',
            new Date().toISOString()
        ]);
        const order = orderRes.rows[0];
        server.log.info({
            order_id: order.order_id,
            razorpay_order_id: razorpayOrder.id,
            total_paise: totalPaise
        }, 'Order created, awaiting payment');
        return {
            order_id: order.order_id,
            razorpay_order_id: razorpayOrder.id,
            amount_inr: totalPaise / 100,
            amount_paise: totalPaise,
            currency: 'INR'
        };
    }
    /**
     * Validate and process Razorpay webhook
     * Confirms payment and updates order status
     */
    async function processPaymentWebhook(payload, webhookSignature) {
        // Verify webhook signature
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) {
            throw server.httpErrors.internalServerError('Webhook secret not configured');
        }
        const digest = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
        if (digest !== webhookSignature) {
            server.log.warn({ signature: webhookSignature }, 'Invalid webhook signature');
            throw server.httpErrors.unauthorized('Invalid webhook signature');
        }
        const event = payload.event;
        if (event === 'payment.authorized') {
            const payment = payload.payload.payment.entity;
            const orderId = payment.notes.order_id;
            // Update order with payment details
            const orderRes = await server.db.query(`UPDATE public.orders
         SET payment_status = $1, razorpay_payment_id = $2, status = $3, updated_at = NOW()
         WHERE razorpay_order_id = $4
         RETURNING *`, ['CONFIRMED', payment.id, 'CONFIRMED', payment.order_id]);
            if (orderRes.rowCount === 0) {
                server.log.warn({ razorpay_order_id: payment.order_id }, 'Order not found for payment webhook');
                return { acknowledged: false };
            }
            const order = orderRes.rows[0];
            server.log.info({ order_id: order.order_id, payment_id: payment.id, amount_inr: payment.amount / 100 }, 'Payment confirmed, order status updated');
            // Queue e-challan generation
            try {
                await server.queues.listingQueue.add('GENERATE_CHALLAN', { order_id: order.id }, { delay: 5000, attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
            }
            catch (err) {
                server.log.error({ err, order_id: order.id }, 'Failed to queue challan generation');
            }
            return { acknowledged: true, order_id: order.order_id };
        }
        if (event === 'payment.failed') {
            const payment = payload.payload.payment.entity;
            await server.db.query(`UPDATE public.orders
         SET payment_status = $1, razorpay_payment_id = $2, status = $3, updated_at = NOW()
         WHERE razorpay_order_id = $4`, ['FAILED', payment.id, 'PAYMENT_FAILED', payment.order_id]);
            server.log.warn({ razorpay_payment_id: payment.id }, 'Payment failed');
            return { acknowledged: true };
        }
        if (event === 'order.paid') {
            // Redundant check for paid status
            const order = payload.payload.order.entity;
            const notes = order.notes || {};
            await server.db.query(`UPDATE public.orders
         SET payment_status = $1, status = $2, updated_at = NOW()
         WHERE razorpay_order_id = $3`, ['CONFIRMED', 'CONFIRMED', order.id]);
            server.log.info({ razorpay_order_id: order.id }, 'Order marked paid');
            return { acknowledged: true };
        }
        // Other events - just acknowledge
        return { acknowledged: true };
    }
    /**
     * Confirm delivery and release escrow
     * Called after buyer confirms receipt
     */
    async function confirmDelivery(buyerId, orderId, rating) {
        const orderRes = await server.db.query(`SELECT * FROM public.orders WHERE order_id = $1 AND buyer_id = $2`, [orderId, buyerId]);
        if (!orderRes.rows[0]) {
            throw server.httpErrors.notFound('Order not found or not authorized');
        }
        const order = orderRes.rows[0];
        if (order.status !== 'CONFIRMED') {
            throw server.httpErrors.badRequest(`Cannot confirm delivery for order with status ${order.status}`);
        }
        await server.db.query('BEGIN');
        try {
            // Update order status
            const deliveryDate = new Date().toISOString();
            await server.db.query(`UPDATE public.orders
         SET status = $1, delivery_confirmed_at = $2, updated_at = NOW()
         WHERE order_id = $3`, ['COMPLETED', deliveryDate, orderId]);
            // Store buyer rating if provided
            if (rating && rating >= 1 && rating <= 5) {
                await server.db.query(`INSERT INTO public.order_ratings (order_id, buyer_id, farmer_id, rating, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (order_id) DO UPDATE SET rating = EXCLUDED.rating`, [order.id, buyerId, order.farmer_id, rating]);
            }
            // Queue escrow release payment
            try {
                const farmerPayoutAmount = order.subtotal_paise; // Farmer gets crop value minus commission
                await server.queues.payoutQueue.add('RELEASE_ESCROW', {
                    order_id: order.id,
                    farmer_id: order.farmer_id,
                    amount_paise: farmerPayoutAmount,
                    razorpay_order_id: order.razorpay_order_id
                }, { delay: 1000, attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
            }
            catch (err) {
                server.log.error({ err, order_id: orderId }, 'Failed to queue escrow release');
            }
            // Update farmer trust score
            try {
                await server.queues.marketQueue.add('UPDATE_TRUST_SCORE', { farmer_id: order.farmer_id }, { delay: 5000, attempts: 2 });
            }
            catch (err) {
                server.log.warn({ err }, 'Failed to queue trust score update');
            }
            await server.db.query('COMMIT');
            server.log.info({ order_id: orderId, farmer_id: order.farmer_id, rating }, 'Delivery confirmed, escrow released');
            return {
                order_id: orderId,
                status: 'COMPLETED',
                delivery_date: deliveryDate,
                payout_status: 'QUEUED'
            };
        }
        catch (err) {
            await server.db.query('ROLLBACK');
            throw err;
        }
    }
    /**
     * Get order payment status
     */
    async function getOrderPaymentStatus(orderId) {
        const result = await server.db.query(`SELECT order_id, status, payment_status, razorpay_order_id, razorpay_payment_id, 
              total_paise, delivery_confirmed_at
       FROM public.orders WHERE order_id = $1`, [orderId]);
        if (!result.rows[0]) {
            throw server.httpErrors.notFound('Order not found');
        }
        const order = result.rows[0];
        return {
            order_id: order.order_id,
            status: order.status,
            payment_status: order.payment_status,
            razorpay_details: {
                order_id: order.razorpay_order_id,
                payment_id: order.razorpay_payment_id
            },
            amount_inr: order.total_paise / 100,
            delivery_confirmed: !!order.delivery_confirmed_at
        };
    }
    /**
     * Get buyer's orders
     */
    async function getBuyerOrders(buyerId, opts) {
        const status = opts.status || 'CONFIRMED';
        const limit = opts.limit || 50;
        const query = `
      SELECT o.*, l.crop_type, u.kisan_id AS farmer_kisan_id, u.first_name AS farmer_name
      FROM public.orders o
      JOIN public.listings l ON l.id = o.listing_id
      JOIN public.users u ON u.id = o.farmer_id
      WHERE o.buyer_id = $1 AND (${status ? `o.status = $2` : '1=1'})
      ORDER BY o.created_at DESC
      LIMIT $3
    `;
        const params = status ? [buyerId, status, limit] : [buyerId, limit];
        const result = await server.db.query(query, params);
        return {
            orders: result.rows.map((r) => ({
                order_id: r.order_id,
                crop_type: r.crop_type,
                farmer_kisan_id: r.farmer_kisan_id,
                farmer_name: r.farmer_name,
                quantity_kg: Number(r.quantity_kg),
                price_per_kg_inr: Number(r.agreed_price_paise) / 100,
                total_inr: Number(r.total_paise) / 100,
                status: r.status,
                payment_status: r.payment_status,
                created_at: r.created_at,
                delivery_confirmed_at: r.delivery_confirmed_at
            })),
            count: result.rows.length
        };
    }
    return {
        createOrder,
        processPaymentWebhook,
        confirmDelivery,
        getOrderPaymentStatus,
        getBuyerOrders
    };
}
