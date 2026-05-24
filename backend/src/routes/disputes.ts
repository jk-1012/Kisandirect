import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createDisputeService } from '../services/dispute-service.js';

const disputeSchema = z.object({ order_id: z.string().uuid(), reason: z.string().min(10), details: z.string().max(1000).optional() });
const evidenceRequestSchema = z.object({ photo_count: z.number().int().min(1).max(5) });
const evidenceConfirmSchema = z.object({ s3_keys: z.array(z.string().min(1)).min(1) });
const resolveSchema = z.object({ outcome: z.enum(['BUYER_FAVOR', 'FARMER_FAVOR']), notes: z.string().max(1000).optional() });

export default async function (server: FastifyInstance) {
  const disputeService = createDisputeService(server);

  server.post('/disputes', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = disputeSchema.parse(request.body as Record<string, unknown>);
    const buyerId = request.user.userId;
    const dispute = await disputeService.createDispute(buyerId, payload.order_id, payload.reason, payload.details ?? null);
    return reply.code(201).send(dispute);
  });

  server.post('/disputes/:disputeId/evidence', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { disputeId } = request.params as { disputeId: string };
    const userId = request.user.userId;
    const payload = evidenceRequestSchema.parse(request.body as Record<string, unknown>);
    const evidence = await disputeService.getEvidenceUploadUrls(userId, disputeId, payload.photo_count);
    return reply.code(201).send(evidence);
  });

  server.post('/disputes/:disputeId/evidence/confirm', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { disputeId } = request.params as { disputeId: string };
    const userId = request.user.userId;
    const payload = evidenceConfirmSchema.parse(request.body as Record<string, unknown>);
    const evidence = await disputeService.confirmEvidenceUpload(userId, disputeId, payload.s3_keys);
    return reply.code(200).send(evidence);
  });

  server.post('/disputes/:disputeId/resolve', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { disputeId } = request.params as { disputeId: string };
    const payload = resolveSchema.parse(request.body as Record<string, unknown>);
    const actorId = request.user.userId;
    const result = await disputeService.resolveDispute(actorId, disputeId, payload.outcome, payload.notes ?? '');
    return reply.send(result);
  });

  server.get('/disputes/:disputeId', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { disputeId } = request.params as { disputeId: string };
    const userId = request.user.userId;
    const dispute = await disputeService.getDisputeById(userId, disputeId);
    return reply.send(dispute);
  });

  server.get('/disputes', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const disputes = await disputeService.listDisputesForUser(userId);
    return reply.send(disputes);
  });
}
