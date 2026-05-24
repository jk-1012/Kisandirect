import { createOrderService } from '../services/order-service.js';
import { z } from 'zod';
const buyNowSchema = z.object({
    listing_id: z.string().min(1),
    quantity_kg: z.coerce.number().int().min(1),
    delivery_requested: z.boolean().optional().default(false),
    delivery_address: z.string().trim().optional()
}).superRefine((data, ctx) => {
    if (data.delivery_requested && !data.delivery_address) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'delivery_address is required when delivery_requested is true',
            path: ['delivery_address']
        });
    }
});
const offerSchema = z.object({
    listing_id: z.string().min(1),
    quantity_kg: z.coerce.number().positive(),
    offer_price_per_kg_inr: z.number().min(0.01)
});
const rfqSchema = z.object({
    listing_id: z.string().min(1),
    quantity_kg: z.coerce.number().positive(),
    message: z.string().max(500).optional()
});
export default async function (server) {
    const orderService = createOrderService(server);
    server.post('/orders/buy-now', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = buyNowSchema.parse(request.body);
        const buyerId = request.user.userId;
        const result = await orderService.createBuyNowOrder(buyerId, payload.listing_id, payload.quantity_kg, payload.delivery_requested, payload.delivery_address);
        return reply.code(201).send(result);
    });
    server.post('/orders/make-offer', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = offerSchema.parse(request.body);
        const buyerId = request.user.userId;
        const result = await orderService.createOfferOrder(buyerId, payload.listing_id, payload.quantity_kg, payload.offer_price_per_kg_inr);
        return reply.code(201).send(result);
    });
    server.post('/orders/rfq', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = rfqSchema.parse(request.body);
        const buyerId = request.user.userId;
        const result = await orderService.createRfqOrder(buyerId, payload.listing_id, payload.quantity_kg, payload.message ?? '');
        return reply.code(201).send(result);
    });
    server.post('/orders/:orderId/confirm-delivery', { preHandler: [server.authenticate] }, async (request, reply) => {
        const { orderId } = request.params;
        const userId = request.user.userId;
        const result = await orderService.sendDeliveryOtp(userId, orderId);
        return reply.send(result);
    });
    const verifyDeliveryOtpSchema = z.object({ otp: z.string().length(6) });
    server.post('/orders/:orderId/verify-delivery-otp', { preHandler: [server.authenticate] }, async (request, reply) => {
        const { orderId } = request.params;
        const payload = verifyDeliveryOtpSchema.parse(request.body);
        const userId = request.user.userId;
        const result = await orderService.verifyDeliveryOtp(userId, orderId, payload.otp);
        return reply.send(result);
    });
    // Razorpay webhook endpoint – public
    server.post('/payments/webhook', async (request, reply) => {
        const body = request.body;
        const signature = request.headers['x-razorpay-signature'];
        try {
            await orderService.handleRazorpayWebhook(body, signature);
        }
        catch (err) {
            server.log.error({ err }, 'razorpay webhook handling failed');
            return reply.code(400).send({ ok: false });
        }
        return reply.send({ ok: true });
    });
}
