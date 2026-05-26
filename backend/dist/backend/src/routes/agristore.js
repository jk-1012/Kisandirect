import { z } from 'zod';
import { createAgriStoreService } from '../services/agristore-service.js';
const publishSchema = z.object({
    slug: z.string().min(3),
    name: z.string().min(5),
    description: z.string().min(10),
    hero: z.object({
        title: z.string().min(5),
        subtitle: z.string().min(10),
        backgroundImage: z.string().url().optional()
    }),
    blocks: z.array(z.any()),
    metadata: z.object({
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        keywords: z.array(z.string()).optional()
    }).optional()
});
export default async function (server) {
    const agristoreService = createAgriStoreService(server);
    server.post('/publish', { preHandler: server.authenticate }, async (request, reply) => {
        const payload = publishSchema.parse(request.body);
        const userId = request.user.userId;
        const result = await agristoreService.publishPage({ ...payload, ownerId: userId });
        return reply.code(201).send(result);
    });
    server.get('/page/:slug', async (request, reply) => {
        const { slug } = request.params;
        const page = await agristoreService.getPageBySlug(slug);
        if (!page) {
            return reply.code(404).send({ error: 'Page not found' });
        }
        return reply.send(page);
    });
    server.post('/page/:slug/view', async (request, reply) => {
        const { slug } = request.params;
        const userAgent = request.headers['user-agent'] ?? undefined;
        const ip = request.ip;
        await agristoreService.recordPageView(slug, userAgent, ip);
        return reply.send({ success: true });
    });
    server.get('/page/:slug/analytics', { preHandler: server.authenticate }, async (request, reply) => {
        const { slug } = request.params;
        const analytics = await agristoreService.getAnalytics(slug);
        return reply.send(analytics);
    });
    server.get('/page/:slug/qrcode', async (request, reply) => {
        const { slug } = request.params;
        const page = await agristoreService.getPageBySlug(slug);
        if (!page) {
            return reply.code(404).send({ error: 'Page not found' });
        }
        const dataUrl = await agristoreService.generateQrCodeUrl(slug);
        reply.header('Content-Type', 'application/json');
        return reply.send({ slug, dataUrl });
    });
}
