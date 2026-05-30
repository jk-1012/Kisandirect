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

  server.decorate('requireRole', function (roles: string[]) {
    return async (request: any, reply: any) => {
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

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireKYC: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireRole: (roles: string[]) => (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireAdmin: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireOps: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireModerator: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
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
