import { z } from 'zod';
import { createColdStorageService } from '../services/cold-storage-service.js';
const nearbySchema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    radius_km: z.coerce.number().min(1).max(200).optional().default(50),
    capacity_needed_mt: z.coerce.number().positive().optional(),
    crop_type: z.string().optional()
});
const availabilitySchema = z.object({
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
const bookingSchema = z.object({
    facility_id: z.string().uuid(),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    exit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity_mt: z.coerce.number().positive(),
    crop_type: z.string().min(2),
    temperature_agreed_min: z.coerce.number().optional(),
    temperature_agreed_max: z.coerce.number().optional()
});
export default async function (server) {
    const coldStorageService = createColdStorageService(server);
    server.get('/cold-storage/nearby', async (request, reply) => {
        const query = nearbySchema.parse(request.query);
        const facilities = await coldStorageService.searchColdStoragesNearby(query.lat, query.lng, query.radius_km, query.capacity_needed_mt, query.crop_type);
        return reply.send({ facilities, count: facilities.length });
    });
    server.get('/cold-storage/search', async (request, reply) => {
        const query = nearbySchema.parse(request.query);
        const facilities = await coldStorageService.searchColdStoragesNearby(query.lat, query.lng, query.radius_km, query.capacity_needed_mt, query.crop_type);
        return reply.send({ facilities, count: facilities.length });
    });
    server.get('/cold-storage/:facilityId/availability', async (request, reply) => {
        const { facilityId } = request.params;
        const query = availabilitySchema.parse(request.query);
        const availability = await coldStorageService.getFacilityAvailability(facilityId, query.from_date, query.to_date);
        return reply.send(availability);
    });
    server.post('/cold-storage/bookings', { preHandler: [server.authenticate, server.requireKYC] }, async (request, reply) => {
        const payload = bookingSchema.parse(request.body);
        const userId = request.user.userId;
        const booking = await coldStorageService.createBooking(userId, payload.facility_id, payload.entry_date, payload.exit_date, payload.quantity_mt, payload.crop_type, payload.temperature_agreed_min, payload.temperature_agreed_max);
        return reply.code(201).send(booking);
    });
    server.get('/cold-storage/bookings', { preHandler: [server.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const bookings = await coldStorageService.getUserBookings(userId);
        return reply.send({ bookings });
    });
}
