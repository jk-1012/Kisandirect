import fp from 'fastify-plugin';
export default fp(async function (server) {
    server.decorate('authenticate', async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch (error) {
            reply.unauthorized('Invalid or expired token');
        }
    });
    server.decorate('requireKYC', async (request, reply) => {
        if (request.user?.kycStatus !== 'ACTIVE') {
            return reply.code(403).send({ error: 'KYC_REQUIRED', nextStep: '/kyc' });
        }
    });
});
