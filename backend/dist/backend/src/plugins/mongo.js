import fp from 'fastify-plugin';
import { MongoClient } from 'mongodb';
const DEFAULT_DB = 'kisandirect_agristore';
export const mongoPlugin = fp(async (server) => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is required for mongo plugin');
    }
    const client = new MongoClient(uri);
    await client.connect();
    const dbName = process.env.MONGODB_DB ?? DEFAULT_DB;
    const db = client.db(dbName);
    server.decorate('mongo', {
        client,
        db
    });
    server.addHook('onClose', async () => {
        await client.close();
    });
});
