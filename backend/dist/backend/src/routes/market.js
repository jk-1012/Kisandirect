import { z } from 'zod';
import { createMarketService } from '../services/market-service.js';
const intelligenceQuerySchema = z.object({
    crop_type: z.string().min(1),
    state_code: z.string().length(2)
});
export default async function (server) {
    const marketService = createMarketService(server);
    server.get('/market/intelligence', async (request, reply) => {
        const query = intelligenceQuerySchema.parse(request.query);
        const intelligence = await marketService.getMarketIntelligence(query.crop_type, query.state_code);
        return reply.send(intelligence);
    });
    server.get('/market/health', async () => ({ ok: true, type: 'market', timestamp: new Date().toISOString() }));
}
