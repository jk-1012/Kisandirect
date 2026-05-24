import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createOrderService } from '../services/order-service.js';
import { createChallanService } from '../services/challan-service.js';
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

export default async function (server: FastifyInstance) {
  const orderService = createOrderService(server);
  const challanService = createChallanService(server);

  server.post('/orders/buy-now', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = buyNowSchema.parse(request.body as Record<string, unknown>);
    const buyerId = request.user.userId;
    const result = await orderService.createBuyNowOrder(
      buyerId,
      payload.listing_id,
      payload.quantity_kg,
      payload.delivery_requested,
      payload.delivery_address
    );
    return reply.code(201).send(result);
  });

  server.post('/orders/make-offer', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = offerSchema.parse(request.body as Record<string, unknown>);
    const buyerId = request.user.userId;
    const result = await orderService.createOfferOrder(buyerId, payload.listing_id, payload.quantity_kg, payload.offer_price_per_kg_inr);
    return reply.code(201).send(result);
  });

  server.post('/orders/rfq', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = rfqSchema.parse(request.body as Record<string, unknown>);
    const buyerId = request.user.userId;
    const result = await orderService.createRfqOrder(buyerId, payload.listing_id, payload.quantity_kg, payload.message ?? '');
    return reply.code(201).send(result);
  });

  server.post('/orders/:orderId/confirm-delivery', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };
    const userId = request.user.userId;
    const result = await orderService.sendDeliveryOtp(userId, orderId);
    return reply.send(result);
  });

  const verifyDeliveryOtpSchema = z.object({ otp: z.string().length(6) });

  server.post('/orders/:orderId/verify-delivery-otp', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };
    const payload = verifyDeliveryOtpSchema.parse(request.body as Record<string, unknown>);
    const userId = request.user.userId;
    const result = await orderService.verifyDeliveryOtp(userId, orderId, payload.otp);
    return reply.send(result);
  });

  server.post('/orders/:orderId/challan', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };
    const userId = request.user.userId;

    const result = await challanService.createEChallan(orderId, userId);
    return reply.code(201).send(result);
  });

  server.post('/orders/:orderId/challan/sign', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };
    const userId = request.user.userId;
    const result = await challanService.signEChallan(orderId, userId);
    return reply.send(result);
  });

  const verifyChallanOtpSchema = z.object({ otp: z.string().length(6) });
  server.post('/orders/:orderId/challan/verify-otp', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };
    const payload = verifyChallanOtpSchema.parse(request.body as Record<string, unknown>);
    const userId = request.user.userId;
    const result = await challanService.verifyEChallanOtp(orderId, userId, payload.otp);
    return reply.send(result);
  });

  // Razorpay webhook endpoint – public
  server.post('/payments/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const signature = request.headers['x-razorpay-signature'] as string | undefined;
    try {
      await orderService.handleRazorpayWebhook(body, signature);
    } catch (err: any) {
      server.log.error({ err }, 'razorpay webhook handling failed');
      return reply.code(400).send({ ok: false });
    }
    return reply.send({ ok: true });
  });
}
