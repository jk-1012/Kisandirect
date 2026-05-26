import { z } from 'zod';
import { createComplianceService } from '../services/compliance-service.js';
const consentSchema = z.object({
    consent_type: z.string().min(3),
    consented: z.boolean(),
    policy_version: z.string().min(1)
});
const accessRequestSchema = z.object({ note: z.string().max(1000).optional() });
const erasureRequestSchema = z.object({ note: z.string().max(1000).optional() });
export default async function (server) {
    const complianceService = createComplianceService(server);
    server.post('/compliance/consent', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = consentSchema.parse(request.body);
        const userId = request.user.userId;
        const consent = await complianceService.createConsent(userId, payload.consent_type, payload.consented, payload.policy_version, request.ip);
        return reply.code(201).send(consent);
    });
    server.get('/compliance/consents', { preHandler: [server.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const consents = await complianceService.listConsents(userId);
        return reply.send({ consents });
    });
    server.post('/compliance/access-request', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = accessRequestSchema.parse(request.body);
        const userId = request.user.userId;
        const requestRecord = await complianceService.submitDataAccessRequest(userId, payload.note ?? '');
        return reply.code(201).send(requestRecord);
    });
    server.get('/compliance/access-request/:requestId', { preHandler: [server.authenticate] }, async (request, reply) => {
        const { requestId } = request.params;
        const userId = request.user.userId;
        const data = await complianceService.fulfillDataAccessRequest(userId, requestId);
        return reply.send(data);
    });
    server.post('/compliance/erasure-request', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = erasureRequestSchema.parse(request.body);
        const userId = request.user.userId;
        const requestRecord = await complianceService.submitDataErasureRequest(userId, payload.note ?? '');
        return reply.code(201).send(requestRecord);
    });
}
