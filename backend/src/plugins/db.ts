import fp from 'fastify-plugin';
import { Pool } from 'pg';

type DbClient = {
  query: typeof Pool.prototype.query;
};

export const dbPlugin = fp(async (server) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString });
  await pool.query('SELECT 1');

  server.decorate('db', {
    query: pool.query.bind(pool)
  });

  server.addHook('onClose', async () => {
    await pool.end();
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
  }
}
