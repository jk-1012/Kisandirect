import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRfqService } from '../services/rfq-service.js';
import { z } from 'zod';

export default async function (server: FastifyInstance) {
  const rfqService = createRfqService(server);

  const createSchema = z.object({
    crop_type: z.string().min(1),
    quantity_mt: z.coerce.number().positive(),
    price_ceiling_inr_per_kg: z.coerce.number().positive(),
    delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    delivery_district: z.string().min(1),
    delivery_state_code: z.string().length(2),
    quality_requirements: z.string().max(1000).optional()
  });

  server.post('/rfq', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = createSchema.parse(request.body as Record<string, unknown>);
    const userId = request.user.userId;
    const result = await rfqService.createRfq(userId, payload as any);
    return reply.code(201).send(result);
  });

  const quoteSchema = z.object({ quantity_kg: z.coerce.number().positive(), price_per_kg_inr: z.coerce.number().positive(), available_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().max(500).optional() });

  server.post('/rfq/:rfqId/quotes', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { rfqId } = request.params as { rfqId: string };
    const payload = quoteSchema.parse(request.body as Record<string, unknown>);
    const userId = request.user.userId;
    const result = await rfqService.submitQuote(userId, rfqId, payload as any);
    return reply.code(201).send(result);
  });

  server.get('/rfq/:rfqId', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { rfqId } = request.params as { rfqId: string };
    const result = await rfqService.getRfqById(rfqId);
    return reply.send(result);
  });

  server.get('/rfq/:rfqId/quotes', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { rfqId } = request.params as { rfqId: string };
    const sort = (request.query as any)?.sort as string | undefined;
    const format = (request.query as any)?.format as string | undefined;
    const userId = request.user.userId;
    const result = await rfqService.listQuotes(userId, rfqId, { sort, format });
    if (format === 'csv' && (result as any).csv) {
      reply.header('Content-Type', 'text/csv');
      return reply.send((result as any).csv);
    }
    return reply.send(result);
  });
}
