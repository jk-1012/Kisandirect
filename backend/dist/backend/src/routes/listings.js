import { createListingService } from '../services/listing-service.js';
import { createOfferService } from '../services/offer-service.js';
import { z } from 'zod';
const searchSchema = z.object({
    q: z.string().optional(),
    crop_type: z.string().optional(),
    crop_category: z.string().optional(),
    state: z.string().length(2).optional(),
    district: z.string().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    radius_km: z.coerce.number().optional(),
    price_min: z.coerce.number().optional(),
    price_max: z.coerce.number().optional(),
    quantity_min: z.coerce.number().optional(),
    harvest_date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    harvest_date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    organic: z.coerce.boolean().optional(),
    grade: z.enum(['A', 'B', 'C']).optional(),
    sort: z.enum(['proximity', 'recency', 'price_asc', 'price_desc', 'trust_score']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().optional()
});
const listingCreateSchema = z.object({
    crop_type: z.string().min(1),
    crop_category: z.string().min(1),
    quantity_kg: z.number().min(1).max(100000),
    asking_price_per_kg_inr: z.number().min(0.01),
    harvest_date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date').transform((value) => new Date(value)),
    delivery_available: z.boolean(),
    organic: z.boolean().default(false),
    description: z.string().max(500).optional(),
    photo_s3_keys: z.array(z.string()).max(5).optional(),
    geo_lat: z.number().optional(),
    geo_lng: z.number().optional(),
    justification: z.string().max(500).optional()
});
const listingUpdateSchema = z.object({
    asking_price_per_kg_inr: z.number().min(0.01).optional(),
    quantity_kg: z.number().min(0.1).optional(),
    description: z.string().max(500).optional()
}).refine((payload) => Object.keys(payload).length > 0, 'At least one update field is required');
const farmerListingsSchema = z.object({
    status: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
});
const photoUploadUrlSchema = z.object({
    filename: z.string().min(1),
    content_type: z.enum(['image/jpeg', 'image/png', 'image/webp'])
});
const photoProcessSchema = z.object({
    s3Key: z.string().min(1)
});
export default async function (server) {
    const listingService = createListingService(server);
    const offerService = createOfferService(server);
    server.post('/listings/photo/upload-url', { preHandler: [server.authenticate, server.requireKYC] }, async (request, reply) => {
        const query = photoUploadUrlSchema.parse(request.query);
        const response = await listingService.getPhotoUploadUrl(request.user.userId, query.filename, query.content_type);
        return reply.send(response);
    });
    server.post('/listings/photo/process', { preHandler: server.authenticate }, async (request, reply) => {
        const body = photoProcessSchema.parse(request.body);
        const response = await listingService.processPhoto(request.user.userId, body.s3Key);
        return reply.send(response);
    });
    server.post('/listings', { preHandler: [server.authenticate, server.requireKYC, server.requireIdempotency] }, async (request, reply) => {
        const payload = listingCreateSchema.parse(request.body);
        const listing = await listingService.createListing(request.user.userId, payload);
        return reply.code(201).send(listing);
    });
    server.get('/listings/mine', { preHandler: [server.authenticate, server.requireKYC] }, async (request, reply) => {
        const listings = await listingService.getMyListings(request.user.userId);
        return reply.send({ listings });
    });
    server.get('/listings/:listingId', async (request, reply) => {
        const { listingId } = request.params;
        const listing = await listingService.getListingById(listingId);
        if (!listing) {
            return reply.code(404).send({ error: 'Listing not found' });
        }
        try {
            const key = `listing:views:${listingId}`;
            const incr = await server.queues.connection.incr(key);
            if (incr >= 100) {
                const toAdd = Number(await server.queues.connection.get(key)) || 0;
                if (toAdd > 0) {
                    await server.db.query('UPDATE public.listings SET view_count = view_count + $1 WHERE listing_id = $2', [toAdd, listingId]);
                }
                await server.queues.connection.set(key, 0);
            }
        }
        catch (err) {
            server.log.warn({ err, listingId }, 'failed to increment/sync view count');
        }
        return reply.send(listing);
    });
    server.post('/listings/:listingId/cancel', { preHandler: [server.authenticate, server.requireKYC] }, async (request, reply) => {
        const { listingId } = request.params;
        const result = await listingService.cancelListing(request.user.userId, listingId);
        return reply.send(result);
    });
    server.patch('/listings/:listingId', { preHandler: [server.authenticate, server.requireKYC] }, async (request, reply) => {
        const { listingId } = request.params;
        const payload = listingUpdateSchema.parse(request.body);
        const result = await listingService.updateListing(request.user.userId, listingId, payload);
        return reply.send(result);
    });
    server.delete('/listings/:listingId', { preHandler: [server.authenticate, server.requireKYC] }, async (request, reply) => {
        const { listingId } = request.params;
        const result = await listingService.deleteListing(request.user.userId, listingId);
        return reply.send(result);
    });
    server.get('/listings/search', async (request, reply) => {
        const query = searchSchema.parse(request.query);
        const results = await listingService.searchListings(query);
        return reply.send(results);
    });
    const offerCreateSchema = z.object({ quantity_kg: z.coerce.number().positive(), offer_price_per_kg_inr: z.number().min(0.01) });
    server.post('/listings/:listingId/offers', { preHandler: [server.authenticate, server.requireIdempotency] }, async (request, reply) => {
        const { listingId } = request.params;
        const payload = offerCreateSchema.parse(request.body);
        const buyerId = request.user.userId;
        const result = await offerService.createOffer(buyerId, listingId, payload.quantity_kg, payload.offer_price_per_kg_inr);
        return reply.code(201).send(result);
    });
}
