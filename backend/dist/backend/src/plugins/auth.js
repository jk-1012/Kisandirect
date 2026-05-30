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
    server.decorate('requireRole', function (roles) {
        return async (request, reply) => {
            if (!request.user || !roles.includes(request.user.role)) {
                return reply.code(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
            }
        };
    });
    server.decorate('requireAdmin', async (request, reply) => {
        if (request.user?.role !== 'ADMIN' && request.user?.role !== 'SUPER_ADMIN') {
            return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required' });
        }
    });
    server.decorate('requireOps', async (request, reply) => {
        if (!['ADMIN', 'SUPER_ADMIN', 'OPS_MANAGER'].includes(request.user?.role)) {
            return reply.code(403).send({ error: 'FORBIDDEN', message: 'Operations access required' });
        }
    });
    server.decorate('requireModerator', async (request, reply) => {
        if (!['ADMIN', 'SUPER_ADMIN', 'OPS_MANAGER', 'MODERATOR'].includes(request.user?.role)) {
            return reply.code(403).send({ error: 'FORBIDDEN', message: 'Moderator access required' });
        }
    });
});
