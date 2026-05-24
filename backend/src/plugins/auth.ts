import fp from 'fastify-plugin';

export default fp(async function (server) {
  server.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.unauthorized('Invalid or expired token');
    }
  });

  server.decorate('requireKYC', async (request, reply) => {
    if (request.user?.kycStatus !== 'ACTIVE') {
      return reply.code(403).send({ error: 'KYC_REQUIRED', nextStep: '/kyc' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireKYC: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      phone: string;
      role: string;
      kisanId: string | null;
      kycStatus: string;
      iat?: number;
      exp?: number;
    };
    user: {
      userId: string;
      phone: string;
      role: string;
      kisanId: string | null;
      kycStatus: string;
      iat?: number;
      exp?: number;
    };
  }
}
