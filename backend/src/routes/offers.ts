import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createOfferService } from '../services/offer-service.js';
import { z } from 'zod';

export default async function (server: FastifyInstance) {
  const offerService = createOfferService(server);

  const respondSchema = z.object({ action: z.enum(['ACCEPT', 'COUNTER', 'DECLINE']), counter_price_per_kg_inr: z.number().optional(), counter_message: z.string().max(500).optional() });

  server.post('/offers/:offerId/respond', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { offerId } = request.params as { offerId: string };
    const payload = respondSchema.parse(request.body as Record<string, unknown>);
    const userId = request.user.userId;
    const result = await offerService.respondToOffer(userId, offerId, payload.action as any, { counter_price_per_kg_inr: payload.counter_price_per_kg_inr, counter_message: payload.counter_message });
    return reply.send(result);
  });
}
