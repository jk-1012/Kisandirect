import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import farmerRoutes from './routes/farmers.js';
import listingRoutes from './routes/listings.js';
import orderRoutes from './routes/orders.js';
import offersRoutes from './routes/offers.js';
import rfqRoutes from './routes/rfq.js';
import ledgerRoutes from './routes/ledger.js';
import marketRoutes from './routes/market.js';
import notificationRoutes from './routes/notifications.js';
import consentRoutes from './routes/consent.js';
import tdsRoutes from './routes/tds.js';
import authPlugin from './plugins/auth.js';
import idempotencyPlugin from './plugins/idempotency.js';
import { dbPlugin } from './plugins/db.js';
import { queuePlugin } from './plugins/queues.js';
import { storagePlugin } from './plugins/storage.js';
import { mongoPlugin } from './plugins/mongo.js';
import disputeRoutes from './routes/disputes.js';
import coldStorageRoutes from './routes/cold-storage.js';
import complianceRoutes from './routes/compliance.js';
import challanRoutes from './routes/challan.js';
import agristoreRoutes from './routes/agristore.js';
import storefrontRoutes from './routes/storefronts.js';
dotenv.config();
export async function buildApp() {
    const server = Fastify({ logger: true });
    await server.register(sensible);
    await server.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "https:"]
            }
        }
    });
    await server.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        allowList: ['127.0.0.1']
    });
    await server.register(cors, { origin: true, credentials: true });
    await server.register(jwt, {
        secret: process.env.JWT_SECRET ?? 'change-me-in-production',
        cookie: {
            cookieName: 'kd_session',
            signed: false
        },
        sign: {
            expiresIn: '15m'
        }
    });
    await server.register(dbPlugin);
    await server.register(mongoPlugin);
    await server.register(storagePlugin);
    await server.register(queuePlugin);
    await server.register(multipart);
    await server.register(authPlugin);
    await server.register(idempotencyPlugin);
    await server.register(authRoutes, { prefix: '/api/v1/auth' });
    await server.register(farmerRoutes, { prefix: '/api/v1/farmers' });
    await server.register(listingRoutes, { prefix: '/api/v1' });
    await server.register(orderRoutes, { prefix: '/api/v1' });
    await server.register(disputeRoutes, { prefix: '/api/v1' });
    await server.register(coldStorageRoutes, { prefix: '/api/v1' });
    await server.register(complianceRoutes, { prefix: '/api/v1' });
    await server.register(offersRoutes, { prefix: '/api/v1' });
    await server.register(rfqRoutes, { prefix: '/api/v1' });
    await server.register(ledgerRoutes, { prefix: '/api/v1' });
    await server.register(marketRoutes, { prefix: '/api/v1' });
    await server.register(notificationRoutes, { prefix: '/api/v1' });
    await server.register(consentRoutes, { prefix: '/api/v1' });
    await server.register(tdsRoutes, { prefix: '/api/v1' });
    await server.register(challanRoutes);
    await server.register(agristoreRoutes, { prefix: '/api/v1/agristore' });
    await server.register(storefrontRoutes, { prefix: '/api/v1' });
    server.get('/api/health', async () => ({ status: 'ok', env: process.env.NODE_ENV ?? 'development' }));
    return server;
}
