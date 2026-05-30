import fp from 'fastify-plugin';
export default fp(async function (server, opts) {
    const ttl = opts.ttl ?? 86400; // default 24 hours
    server.decorate('requireIdempotency', async (request, reply) => {
        const idempotencyKey = request.headers['idempotency-key'];
        if (!idempotencyKey || typeof idempotencyKey !== 'string') {
            return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Idempotency-Key header is required for this operation' });
        }
        const userId = request.user?.userId ?? 'anonymous';
        const redisKey = `idempotency:${userId}:${idempotencyKey}`;
        // We check if we already have a response for this key
        const cachedResponse = await server.queues.connection.get(redisKey);
        if (cachedResponse) {
            server.log.info({ idempotencyKey, userId }, 'Idempotency key hit, returning cached response');
            const parsed = JSON.parse(cachedResponse);
            return reply.code(parsed.statusCode).send(parsed.body);
        }
        // Set an initial processing lock
        const setLock = await server.queues.connection.set(redisKey, JSON.stringify({ processing: true }), { NX: true, EX: 60 });
        if (!setLock) {
            return reply.code(409).send({ error: 'CONFLICT', message: 'A request with this Idempotency-Key is already being processed' });
        }
        // Capture the response after execution
        const replyWithAddHook = reply;
        replyWithAddHook.addHook?.('onSend', async (request, reply, payload) => {
            // Only cache successful or client error responses, not 5xx
            if (reply.statusCode < 500) {
                let parsedPayload = payload;
                try {
                    if (typeof payload === 'string') {
                        parsedPayload = JSON.parse(payload);
                    }
                }
                catch {
                    // ignore
                }
                await server.queues.connection.set(redisKey, JSON.stringify({ statusCode: reply.statusCode, body: parsedPayload }), { EX: ttl });
            }
            else {
                // Clear lock on 5xx to allow retry
                await server.queues.connection.del(redisKey);
            }
            return payload;
        });
    });
});
