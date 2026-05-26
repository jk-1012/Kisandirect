import { z } from 'zod';
import { createTDSService } from '../services/tds-service.js';
export default async function (server) {
    const tdsService = createTDSService(server);
    const summaryQuerySchema = z.object({ financial_year: z.string().optional() });
    server.get('/admin/tds/summary', { preHandler: [server.authenticate] }, async (request, reply) => {
        if (request.user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Forbidden' });
        }
        const query = summaryQuerySchema.parse(request.query);
        const summary = await tdsService.getAdminSummary(query.financial_year);
        return reply.send(summary);
    });
    const form16QuerySchema = z.object({ financial_year: z.string().optional() });
    server.get('/farmers/me/tds/form16a', { preHandler: [server.authenticate] }, async (request, reply) => {
        if (request.user.role !== 'FARMER') {
            return reply.code(403).send({ error: 'Forbidden' });
        }
        const query = form16QuerySchema.parse(request.query);
        const pdf = await tdsService.generateForm16A(request.user.userId, query.financial_year);
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="form16a-${request.user.userId}-${query.financial_year ?? 'current'}.pdf"`);
        return reply.send(pdf);
    });
}
