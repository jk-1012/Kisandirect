import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
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
import authPlugin from './plugins/auth.js';
import { dbPlugin } from './plugins/db.js';
import { queuePlugin } from './plugins/queues.js';
import { storagePlugin } from './plugins/storage.js';
dotenv.config();
const server = Fastify({ logger: true });
await server.register(sensible);
await server.register(helmet, { contentSecurityPolicy: false });
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
await server.register(storagePlugin);
await server.register(queuePlugin);
await server.register(multipart);
await server.register(authPlugin);
await server.register(authRoutes, { prefix: '/api/v1/auth' });
await server.register(farmerRoutes, { prefix: '/api/v1/farmers' });
await server.register(listingRoutes, { prefix: '/api/v1' });
await server.register(orderRoutes, { prefix: '/api/v1' });
await server.register(offersRoutes, { prefix: '/api/v1' });
await server.register(rfqRoutes, { prefix: '/api/v1' });
await server.register(ledgerRoutes, { prefix: '/api/v1' });
await server.register(marketRoutes, { prefix: '/api/v1' });
await server.register(notificationRoutes, { prefix: '/api/v1' });
server.get('/api/health', async () => ({ status: 'ok', env: process.env.NODE_ENV ?? 'development' }));
const port = Number(process.env.PORT ?? 4000);
try {
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Backend running at http://0.0.0.0:${port}`);
}
catch (error) {
    server.log.error(error);
    process.exit(1);
}
