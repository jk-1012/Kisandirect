import { z } from 'zod';
import { createMarketService } from '../services/market-service.js';
import { createNotificationService } from '../services/notification-service.js';
const priceAlertSchema = z.object({
    crop_type: z.string().min(1),
    state_code: z.string().length(2),
    threshold_price_per_kg_inr: z.number().positive(),
    direction: z.enum(['ABOVE', 'BELOW'])
});
export default async function (server) {
    const marketService = createMarketService(server);
    const notificationService = createNotificationService(server);
    server.get('/notifications', { preHandler: [server.authenticate] }, async (request, reply) => {
        const notifications = await notificationService.getNotifications(request.user.userId);
        return reply.send({ notifications });
    });
    server.get('/notifications/unread-count', { preHandler: [server.authenticate] }, async (request, reply) => {
        const count = await notificationService.getUnreadCount(request.user.userId);
        return reply.send({ unread_count: count });
    });
    server.patch('/notifications/:notificationId/read', { preHandler: [server.authenticate] }, async (request, reply) => {
        const { notificationId } = request.params;
        const result = await notificationService.markAsRead(request.user.userId, notificationId);
        return reply.send(result);
    });
    server.post('/notifications/price-alerts', { preHandler: [server.authenticate] }, async (request, reply) => {
        const payload = priceAlertSchema.parse(request.body);
        const result = await marketService.createPriceAlert(request.user.userId, payload);
        return reply.code(201).send(result);
    });
    server.get('/notifications/price-alerts', { preHandler: [server.authenticate] }, async (request, reply) => {
        const alerts = await marketService.listPriceAlerts(request.user.userId);
        return reply.send({ alerts });
    });
    server.delete('/notifications/price-alerts/:alertId', { preHandler: [server.authenticate] }, async (request, reply) => {
        const { alertId } = request.params;
        const result = await marketService.deletePriceAlert(request.user.userId, alertId);
        return reply.send(result);
    });
}
