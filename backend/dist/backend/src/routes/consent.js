import { createConsentService } from '../services/consent-service.js';
export default async function (server) {
    const consentService = createConsentService(server);
    server.post('/consent', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = consentService.consentSchema.parse(request.body);
        const userId = request.user.userId;
        const result = await consentService.recordConsent(userId, payload.consent_type, payload.consented, request.ip);
        return reply.send(result);
    });
    server.get('/me/data', { preHandler: [server.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const result = await consentService.getDataExport(userId);
        return reply.send(result);
    });
    server.delete('/me/account', { preHandler: [server.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const result = await consentService.scheduleAccountDeletion(userId, request.ip);
        return reply.send(result);
    });
    server.post('/me/withdraw-consent', { preHandler: [server.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const result = await consentService.withdrawMarketingConsent(userId, request.ip);
        return reply.send(result);
    });
}
