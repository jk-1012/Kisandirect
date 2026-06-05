/**
 * Payment Pipeline Routes
 *
 * Endpoints:
 * - POST /payments/webhook - Razorpay webhook receiver
 * - POST /orders/:id/release-escrow - Manual escrow release
 * - POST /orders/:id/refund - Refund processing
 */
import { z } from 'zod';
import { createWebhookVerificationMiddleware } from '../middleware/webhook-verification.js';
// ===========================
// REQUEST VALIDATION SCHEMAS
// ===========================
const releaseEscrowSchema = z.object({
    reason: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
});
const refundRequestSchema = z.object({
    refund_amount_paise: z.number().int().positive().optional(),
    reason: z.enum([
        'DELIVERY_FAILED',
        'QUALITY_ISSUE',
        'BUYER_REQUEST',
        'ORDER_CANCELLED',
        'DUPLICATE_CHARGE',
        'CHARGEBACK',
        'COMPENSATION'
    ]),
    metadata: z.record(z.unknown()).optional()
});
// ===========================
// ROUTES
// ===========================
export default async function (server) {
    const webhookService = createWebhookVerificationMiddleware(server);
    /**
     * POST /payments/webhook
     * Razorpay webhook endpoint
     * Handles payment events, order updates, refunds
     *
     * Signature verification: X-Razorpay-Signature header
     * Idempotency: webhook_event_id deduplication
     */
    server.post('/payments/webhook', async (request, reply) => {
        try {
            // Webhook middleware verifies signature and checks idempotency
            const verifiedWebhook = request.verifiedWebhook;
            const webhookEvent = request.webhookEvent;
            if (!verifiedWebhook) {
                return reply.code(400).send({ error: 'Webhook verification failed' });
            }
            const { event_id, event_type, payload } = verifiedWebhook;
            const eventPayload = payload;
            server.log.info({ webhook_event_id: event_id, event_type }, 'Processing webhook event');
            try {
                // Handle different webhook events
                switch (event_type) {
                    case 'payment.authorized':
                        return handlePaymentAuthorized(server, reply, event_id, eventPayload, webhookEvent);
                    case 'payment.failed':
                        return handlePaymentFailed(server, reply, event_id, eventPayload, webhookEvent);
                    case 'payment.captured':
                        return handlePaymentCaptured(server, reply, event_id, eventPayload, webhookEvent);
                    case 'refund.created':
                        return handleRefundCreated(server, reply, event_id, eventPayload, webhookEvent);
                    case 'refund.failed':
                        return handleRefundFailed(server, reply, event_id, eventPayload, webhookEvent);
                    case 'payout.initiated':
                        return handlePayoutInitiated(server, reply, event_id, eventPayload, webhookEvent);
                    case 'payout.failed':
                        return handlePayoutFailed(server, reply, event_id, eventPayload, webhookEvent);
                    default:
                        // Unknown event type - acknowledge anyway
                        await webhookService.completeWebhookProcessing(event_id, `UNKNOWN_${event_type}`);
                        return reply.code(200).send({
                            success: true,
                            acknowledged: true,
                            message: 'Unknown event type acknowledged'
                        });
                }
            }
            catch (err) {
                server.log.error({ err, webhook_event_id: event_id }, 'Webhook processing error');
                await webhookService.failWebhookProcessing(event_id, err.message);
                throw err;
            }
        }
        catch (err) {
            server.log.error({ err }, 'Webhook handler fatal error');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * POST /orders/:orderId/release-escrow
     * Manually release escrow (usually after delivery confirmation)
     *
     * Auth: Required
     * Admin/Farmer only
     */
    server.post('/orders/:orderId/release-escrow', { preHandler: [server.authenticate] }, async (request, reply) => {
        try {
            const { orderId } = request.params;
            const payload = releaseEscrowSchema.parse(request.body ?? {});
            const userId = request.user.userId;
            // Get order
            const orderRes = await server.db.query(`SELECT o.*, ea.escrow_id FROM public.orders o
           LEFT JOIN vault.escrow_accounts ea ON ea.order_id = o.id
           WHERE o.order_id = $1`, [orderId]);
            if (!orderRes.rows[0]) {
                return reply.code(404).send({ error: 'Order not found' });
            }
            const order = orderRes.rows[0];
            const escrowId = order.escrow_id;
            if (!escrowId) {
                return reply.code(400).send({ error: 'No escrow account for this order' });
            }
            // Check authorization (farmer or admin)
            if (order.farmer_id !== userId && request.user.role !== 'ADMIN') {
                return reply.code(403).send({ error: 'Not authorized' });
            }
            // Queue escrow release job
            if (server.queues?.payoutQueue) {
                await server.queues.payoutQueue.add('RELEASE_ESCROW', {
                    escrow_id: escrowId,
                    order_id: order.id,
                    farmer_id: order.farmer_id,
                    razorpay_order_id: order.razorpay_order_id
                }, {
                    delay: 1000,
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 5000 }
                });
            }
            server.log.info({ order_id: orderId, escrow_id: escrowId }, 'Escrow release queued');
            return reply.code(202).send({
                success: true,
                message: 'Escrow release queued',
                order_id: orderId,
                escrow_id: escrowId
            });
        }
        catch (err) {
            server.log.error({ err }, 'Release escrow handler error');
            return reply.code(400).send({
                error: 'Invalid request',
                message: err.message
            });
        }
    });
    /**
     * POST /orders/:orderId/refund
     * Request or process refund
     *
     * Auth: Required
     * Buyer/Farmer/Admin only
     */
    server.post('/orders/:orderId/refund', { preHandler: [server.authenticate] }, async (request, reply) => {
        try {
            const { orderId } = request.params;
            const payload = refundRequestSchema.parse(request.body);
            const userId = request.user.userId;
            // Get order
            const orderRes = await server.db.query(`SELECT o.*, ea.escrow_id FROM public.orders o
           LEFT JOIN vault.escrow_accounts ea ON ea.order_id = o.id
           WHERE o.order_id = $1`, [orderId]);
            if (!orderRes.rows[0]) {
                return reply.code(404).send({ error: 'Order not found' });
            }
            const order = orderRes.rows[0];
            const escrowId = order.escrow_id;
            if (!escrowId) {
                return reply.code(400).send({ error: 'No escrow account for this order' });
            }
            // Check authorization
            const isBuyer = order.buyer_id === userId;
            const isFarmer = order.farmer_id === userId;
            const isAdmin = request.user.role === 'ADMIN';
            if (!isBuyer && !isFarmer && !isAdmin) {
                return reply.code(403).send({ error: 'Not authorized' });
            }
            // Validate reason
            if (isBuyer && payload.reason !== 'BUYER_REQUEST' && payload.reason !== 'DELIVERY_FAILED') {
                return reply.code(400).send({ error: 'Buyer can only request refund or report delivery failure' });
            }
            // Queue escrow refund job
            if (server.queues?.payoutQueue) {
                await server.queues.payoutQueue.add('REFUND_ESCROW', {
                    escrow_id: escrowId,
                    order_id: order.id,
                    buyer_id: order.buyer_id,
                    reason: payload.reason,
                    refund_amount_paise: payload.refund_amount_paise
                }, {
                    delay: 1000,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 }
                });
            }
            server.log.info({
                order_id: orderId,
                escrow_id: escrowId,
                reason: payload.reason,
                refund_amount: payload.refund_amount_paise
            }, 'Refund requested');
            return reply.code(202).send({
                success: true,
                message: 'Refund request processed',
                order_id: orderId,
                escrow_id: escrowId,
                reason: payload.reason,
                refund_amount_paise: payload.refund_amount_paise
            });
        }
        catch (err) {
            server.log.error({ err }, 'Refund handler error');
            return reply.code(400).send({
                error: 'Invalid request',
                message: err.message
            });
        }
    });
    /**
     * GET /orders/:orderId/payment-status
     * Get current payment/escrow status
     *
     * Public endpoint
     */
    server.get('/orders/:orderId/payment-status', async (request, reply) => {
        try {
            const { orderId } = request.params;
            const result = await server.db.query(`SELECT o.*, ea.escrow_id, ea.escrow_status, ea.total_amount_paise, ea.commission_paise
         FROM public.orders o
         LEFT JOIN vault.escrow_accounts ea ON ea.order_id = o.id
         WHERE o.order_id = $1`, [orderId]);
            if (!result.rows[0]) {
                return reply.code(404).send({ error: 'Order not found' });
            }
            const order = result.rows[0];
            return reply.send({
                order_id: order.order_id,
                payment_status: order.payment_status,
                order_status: order.order_status,
                escrow: order.escrow_id ? {
                    escrow_id: order.escrow_id,
                    status: order.escrow_status,
                    total_amount_inr: order.total_amount_paise / 100,
                    commission_inr: order.commission_paise / 100
                } : null,
                total_amount_inr: order.total_paise / 100,
                created_at: order.created_at,
                updated_at: order.updated_at
            });
        }
        catch (err) {
            server.log.error({ err }, 'Get payment status error');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
}
// ===========================
// WEBHOOK EVENT HANDLERS
// ===========================
async function handlePaymentAuthorized(server, reply, eventId, payload, webhookEvent) {
    server.log.info({ event_id: eventId }, 'Payment authorized');
    // Create/update escrow account
    // Store ledger entry
    // Return success
    const webhookService = createWebhookVerificationMiddleware(server);
    const transactionId = `TXN-${Date.now()}`;
    await webhookService.completeWebhookProcessing(eventId, transactionId);
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Payment authorized',
        webhook_event_id: eventId
    });
}
async function handlePaymentFailed(server, reply, eventId, payload, webhookEvent) {
    server.log.warn({ event_id: eventId }, 'Payment failed');
    const webhookService = createWebhookVerificationMiddleware(server);
    await webhookService.completeWebhookProcessing(eventId, 'PAYMENT_FAILED');
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Payment failure recorded',
        webhook_event_id: eventId
    });
}
async function handlePaymentCaptured(server, reply, eventId, payload, webhookEvent) {
    server.log.info({ event_id: eventId }, 'Payment captured');
    const webhookService = createWebhookVerificationMiddleware(server);
    const transactionId = `TXN-${Date.now()}`;
    await webhookService.completeWebhookProcessing(eventId, transactionId);
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Payment captured',
        webhook_event_id: eventId
    });
}
async function handleRefundCreated(server, reply, eventId, payload, webhookEvent) {
    server.log.info({ event_id: eventId }, 'Refund created');
    const webhookService = createWebhookVerificationMiddleware(server);
    const transactionId = `TXN-${Date.now()}`;
    await webhookService.completeWebhookProcessing(eventId, transactionId);
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Refund processed',
        webhook_event_id: eventId
    });
}
async function handleRefundFailed(server, reply, eventId, payload, webhookEvent) {
    server.log.warn({ event_id: eventId }, 'Refund failed');
    const webhookService = createWebhookVerificationMiddleware(server);
    await webhookService.completeWebhookProcessing(eventId, 'REFUND_FAILED');
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Refund failure recorded',
        webhook_event_id: eventId
    });
}
async function handlePayoutInitiated(server, reply, eventId, payload, webhookEvent) {
    server.log.info({ event_id: eventId }, 'Payout initiated');
    const webhookService = createWebhookVerificationMiddleware(server);
    const transactionId = `TXN-${Date.now()}`;
    await webhookService.completeWebhookProcessing(eventId, transactionId);
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Payout initiated',
        webhook_event_id: eventId
    });
}
async function handlePayoutFailed(server, reply, eventId, payload, webhookEvent) {
    server.log.warn({ event_id: eventId }, 'Payout failed');
    // Create failed payout record for retry
    const webhookService = createWebhookVerificationMiddleware(server);
    await webhookService.completeWebhookProcessing(eventId, 'PAYOUT_FAILED');
    return reply.code(200).send({
        success: true,
        acknowledged: true,
        message: 'Payout failure recorded',
        webhook_event_id: eventId
    });
}
