import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createConsentService } from '../services/consent-service.js';

export default async function (server: FastifyInstance) {
  const consentService = createConsentService(server);

  server.post('/consent', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = consentService.consentSchema.parse(request.body as Record<string, unknown>);
    const userId = request.user.userId;
    const result = await consentService.recordConsent(userId, payload.consent_type, payload.consented, request.ip);
    return reply.send(result);
  });

  server.get('/me/data', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const result = await consentService.getDataExport(userId);
    return reply.send(result);
  });

  server.delete('/me/account', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const result = await consentService.scheduleAccountDeletion(userId, request.ip);
    return reply.send(result);
  });

  server.post('/me/withdraw-consent', { preHandler: [server.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const result = await consentService.withdrawMarketingConsent(userId, request.ip);
    return reply.send(result);
  });
}
